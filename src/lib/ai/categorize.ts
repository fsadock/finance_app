import { aiErrorMessage, getAnthropic, getAnthropicOrNull, MODEL_FAST } from "./client";
import { prisma } from "../db";
import { merchantPattern } from "./merchant";
import {
  CATEGORIZE_BATCH_SIZE,
  CATEGORIZE_MIN_CONFIDENCE,
  CATEGORIZE_CACHE_RULE_MIN_CONFIDENCE,
} from "../constants";
import { withRetry } from "../retry";
import { logger } from "../logger";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

type Suggestion = { txId: string; categoryName: string; confidence: number };

type TxInput = { id: string; description: string; merchantRaw: string | null; counterpartyName?: string | null };
type RuleInput = { pattern: string; categoryId: string; id: string };

/** Pure pass-1 rule matching — no DB calls. Returns matched tx→categoryId pairs and unmatched remainder. */
export function matchRulesToTransactions<T extends TxInput>(
  txs: T[],
  rules: RuleInput[]
): { matched: Array<{ tx: T; rule: RuleInput }>; remaining: T[] } {
  const ruleMap = new Map(rules.map((r) => [r.pattern, r]));
  const matched: Array<{ tx: T; rule: RuleInput }> = [];
  const remaining: T[] = [];

  for (const t of txs) {
    const pattern = merchantPattern(t);
    const rule = pattern ? ruleMap.get(pattern) : undefined;
    if (rule) {
      matched.push({ tx: t, rule });
    } else {
      remaining.push(t);
    }
  }

  return { matched, remaining };
}

/**
 * Categorizes one batch of REVIEW transactions (rules first, then AI).
 * Pass the ids returned in `attemptedIds` from previous passes as `skipIds` — otherwise transactions the
 * AI can't classify confidently are re-fetched on every pass and block everything behind them.
 */
async function categorizeReviewTransactions(skipIds: string[] = [], { useAI = true } = {}) {
  const [txs, categories, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "REVIEW", ...(skipIds.length > 0 ? { id: { notIn: skipIds } } : {}) },
      orderBy: { date: "desc" },
      select: {
        id: true,
        description: true,
        merchantRaw: true,
        amount: true,
        date: true,
        paymentMethod: true,
        counterpartyName: true,
        counterpartyType: true,
        merchantName: true,
        merchantCnae: true,
        mcc: true,
        installmentNumber: true,
        totalInstallments: true,
        pluggyCategory: true,
        account: { select: { type: true } },
      },
      take: CATEGORIZE_BATCH_SIZE,
    }),
    prisma.category.findMany({ where: { excludeFromBudget: false } }),
    prisma.merchantRule.findMany(),
  ]);

  const attemptedIds = txs.map((t) => t.id);
  if (txs.length === 0) {
    return { applied: 0, fromRules: 0, fromAI: 0, attemptedIds, suggestions: [] as Suggestion[] };
  }

  const catByName = new Map(categories.map((c) => [c.name, c]));

  // Pass 1: apply existing rules
  const { matched, remaining } = matchRulesToTransactions(txs, rules);
  let fromRules = 0;
  for (const { tx: t, rule } of matched) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: t.id },
        data: { categoryId: rule.categoryId, status: "POSTED" },
      }),
      prisma.merchantRule.update({
        where: { id: rule.id },
        data: { hits: { increment: 1 } },
      }),
    ]);
    fromRules++;
  }

  if (remaining.length === 0 || !useAI) {
    return { applied: fromRules, fromRules, fromAI: 0, attemptedIds, suggestions: [] as Suggestion[] };
  }

  // Pass 2: AI classify the rest
  const categoryNames = categories.map((c) => c.name);
  const categoryList = categories.map((c) => `- ${c.name}${c.group ? ` (${c.group})` : ""}`).join("\n");

  const sanitize = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120);
  const COUNTERPARTY: Record<string, string> = { SELF: "o próprio titular", CPF: "pessoa física (CPF)", CNPJ: "empresa (CNPJ)" };
  const txList = remaining
    .map((t) => {
      const parts = [
        `id=${t.id}`,
        sanitize(t.description),
        `${t.amount.toFixed(2)} BRL`,
        t.date.toISOString().slice(0, 10),
        `conta: ${t.account.type === "CREDIT_CARD" ? "cartão de crédito" : "conta bancária"}`,
      ];
      if (t.merchantRaw && t.merchantRaw !== t.description) parts.push(`raw: ${sanitize(t.merchantRaw)}`);
      if (t.paymentMethod) parts.push(`método: ${t.paymentMethod}`);
      if (t.counterpartyType || t.counterpartyName) {
        parts.push(`contraparte: ${COUNTERPARTY[t.counterpartyType ?? ""] ?? "?"}${t.counterpartyName ? ` "${sanitize(t.counterpartyName)}"` : ""}`);
      }
      if (t.merchantName) parts.push(`comerciante: ${sanitize(t.merchantName)}${t.merchantCnae ? ` (CNAE ${t.merchantCnae})` : ""}`);
      if (t.mcc) parts.push(`MCC ${t.mcc}`);
      if (t.totalInstallments) parts.push(`parcela ${t.installmentNumber ?? "?"}/${t.totalInstallments}`);
      if (t.pluggyCategory) parts.push(`categoria do banco: ${t.pluggyCategory}`);
      return parts.join(" | ");
    })
    .join("\n");

  const SuggestionsSchema = z.object({
    suggestions: z.array(
      z.object({
        txId: z.string(),
        categoryName: z.enum(categoryNames as [string, ...string[]]),
        confidence: z.number(),
      })
    ),
  });

  const client = await getAnthropic();
  const resp = await withRetry(() =>
    client.messages.parse({
      model: MODEL_FAST,
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text:
            "Você é um classificador de transações bancárias brasileiras. " +
            "Para cada transação, escolha a categoria mais apropriada da lista fornecida. " +
            "Valores negativos são saídas; positivos são entradas. Cada linha pode trazer contexto estruturado " +
            "(método de pagamento, contraparte CPF/CNPJ, comerciante, CNAE, MCC, parcela, categoria do banco) — use-o antes da descrição.\n\n" +
            "PIX / TED / DOC — o método NÃO define a categoria, o destinatário define:\n" +
            "- Saída para o próprio titular (mesma titularidade): \"Transferências\"\n" +
            "- Entrada vinda do próprio titular: é dinheiro trazido de uma conta que NÃO está conectada — pode ser salário recebido em outro banco. " +
            "Use \"Transferências\" só se a descrição indicar resgate/movimentação entre contas; caso contrário escolha a categoria mais provável com confidence baixa (<0.6) para o usuário revisar\n" +
            "- Contraparte é empresa (CNPJ): é uma compra/pagamento — classifique pelo nome do comerciante (padaria → Restaurantes/Cafés, mercado → Mercado, etc.)\n" +
            "- Saída para pessoa física (CPF): use o nome/descrição (aluguel → Aluguel, diarista/faxina → Contas de casa, professor → Educação, médico/psicólogo → Saúde); se não houver pista, \"Pagamentos a pessoas\"\n" +
            "- Entrada de pessoa física (CPF): geralmente \"Reembolsos\" (divisão de conta, devolução), salvo indício de salário\n" +
            "- Sem contraparte identificada: Pix/TED só é \"Transferências\" se a descrição indicar conta própria; caso contrário trate como pagamento pelo nome\n\n" +
            "CARTÃO DE CRÉDITO:\n" +
            "- Pagamento de fatura (\"PAGAMENTO RECEBIDO\", \"PAG FATURA\", débito automático da fatura): \"Pagamento de fatura\"\n" +
            "- Estorno/crédito de compra: mesma categoria da compra original (pelo comerciante); cashback: \"Reembolsos\"\n" +
            "- Compras parceladas: categoria do comerciante, como qualquer compra\n" +
            "- IOF, juros, encargos, multa, anuidade, tarifa, cesta de serviços, seguro do cartão/prestamista: \"Tarifas & Juros\"\n\n" +
            "CONTA / INVESTIMENTOS / RENDA:\n" +
            "- Aplicação, resgate, RDB, CDB, caixinha, porquinho, poupança, Tesouro, corretora: \"Investimentos\"\n" +
            "- PGBL, VGBL, previdência: \"Previdência privada\"\n" +
            "- Rendimento, juros recebidos, dividendos, JCP: \"Rendimentos\"\n" +
            "- Salário, folha, proventos, férias, 13º, PLR: \"Salário\"\n" +
            "- Boleto: classifique pelo beneficiário/descrição (condomínio, luz, água, gás → Contas de casa; escola → Educação)\n\n" +
            "COMERCIANTES COMUNS:\n" +
            "- Apple, apple.com/bill, iCloud, Microsoft 365, Google One, ChatGPT, Notion, GitHub: \"Tecnologia & Software\"\n" +
            "- Netflix, Spotify, Disney+, HBO/Max, Globoplay, Prime Video, YouTube Premium, Deezer: \"Streaming\"\n" +
            "- Barbearia, cabeleireiro, salão, estética, cosmético, manicure: \"Cuidados pessoais\"\n" +
            "- Supermercado (Pão de Açúcar, Carrefour, Extra, Atacadão, Assaí, Sam's Club): \"Mercado\"\n" +
            "- iFood, Rappi, James, Zé Delivery: \"Delivery\"\n" +
            "- Uber, 99, InDriver, Cabify: \"Apps de mobilidade\"\n" +
            "- Posto Shell/Ipiranga/BR/Petrobras, combustível: \"Combustível\"; Sem Parar, ConectCar, Veloe, estacionamento: \"Estacionamento & Pedágio\"\n" +
            "- Drogasil, Drogaria São Paulo, Pague Menos, Raia: \"Farmácia\"; plano de saúde, clínica, laboratório, hospital: \"Saúde\"\n" +
            "- Smartfit, Bluefit, Gympass/Wellhub, academia: \"Academia\"\n" +
            "- Mercado Livre, Amazon, Shopee, Magalu, Casas Bahia: olhe o item se descrito; default \"Eletrônicos\" ou \"Casa & Decoração\"\n" +
            "- IPVA, IPTU, DARF, DAS, Receita Federal, licenciamento: \"Impostos & Taxas\"\n" +
            "- Porto Seguro, SulAmérica, Bradesco Seguros, seguro auto/vida: \"Seguros\"\n" +
            "- Petshop, ração, veterinário: \"Pets\"\n\n" +
            "Retorne uma sugestão por transação, com o id exatamente como recebido e confidence entre 0 e 1. " +
            "Se não conseguir identificar, use \"Outros\" com confidence baixa (<0.5).\n\n" +
            "Categorias disponíveis:\n" +
            categoryList,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `Classifique estas ${remaining.length} transações:\n\n${txList}` }],
      output_config: { format: zodOutputFormat(SuggestionsSchema) },
    })
  );

  if (resp.stop_reason === "max_tokens") logger.warn("ai:categorize_truncated", { batch: remaining.length });
  const parsed = resp.parsed_output;
  if (!parsed) throw new Error(`Claude returned no parseable output (stop_reason=${resp.stop_reason})`);

  let fromAI = 0;
  // Build txId -> tx map for merchant lookup
  const txById = new Map(remaining.map((t) => [t.id, t]));
  for (const s of parsed.suggestions) {
    const cat = catByName.get(s.categoryName);
    if (!cat) continue;
    if (s.confidence < CATEGORIZE_MIN_CONFIDENCE) continue;
    const tx = txById.get(s.txId);
    if (!tx) continue;

    await prisma.transaction.update({
      where: { id: s.txId },
      data: { categoryId: cat.id, status: "POSTED" },
    });
    fromAI++;

    // Cache rule for future tx
    const pattern = merchantPattern(tx);
    if (pattern && s.confidence >= CATEGORIZE_CACHE_RULE_MIN_CONFIDENCE) {
      const existing = await prisma.merchantRule.findUnique({ where: { pattern }, select: { source: true } });
      if (!existing) {
        await prisma.merchantRule.create({
          data: { pattern, categoryId: cat.id, confidence: s.confidence, source: "AI", hits: 1 },
        });
      } else if (existing.source === "AI") {
        // never overwrite USER rules
        await prisma.merchantRule.update({
          where: { pattern },
          data: { categoryId: cat.id, confidence: s.confidence },
        });
      }
    }
  }

  const usage = {
    input: resp.usage.input_tokens,
    output: resp.usage.output_tokens,
    cacheRead: resp.usage.cache_read_input_tokens ?? 0,
    cacheCreation: resp.usage.cache_creation_input_tokens ?? 0,
  };
  logger.info("ai:categorize", { fromRules, fromAI, ...usage });

  return { applied: fromRules + fromAI, fromRules, fromAI, attemptedIds, suggestions: parsed.suggestions, usage };
}

/**
 * Categorizes every REVIEW transaction: passes continue until each has been tried once.
 * Returns the AI error (if any) instead of throwing, so callers can show it.
 */
export async function categorizeAllPending(maxPasses = 150) {
  // Without a key the AI is simply skipped: merchant rules still apply, the rest waits in REVIEW.
  const useAI = Boolean(await getAnthropicOrNull());
  const out = { applied: 0, fromRules: 0, fromAI: 0, remaining: 0, error: null as string | null, aiConfigured: useAI };
  const attempted: string[] = [];
  for (let i = 0; i < maxPasses; i++) {
    try {
      const r = await categorizeReviewTransactions(attempted, { useAI });
      if (r.attemptedIds.length === 0) break;
      attempted.push(...r.attemptedIds);
      out.applied += r.applied;
      out.fromRules += r.fromRules;
      out.fromAI += r.fromAI;
    } catch (e) {
      out.error = aiErrorMessage(e);
      logger.error("ai:categorize_failed", { pass: i + 1, error: e instanceof Error ? e.message : String(e) });
      break;
    }
  }
  out.remaining = await prisma.transaction.count({ where: { status: "REVIEW" } });
  return out;
}
