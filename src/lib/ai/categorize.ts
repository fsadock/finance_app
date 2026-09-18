import { getAnthropic, MODEL_FAST } from "@/lib/ai/client";
import { withRetry } from "@/lib/infra/retry";
import { logger } from "@/lib/infra/logger";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export type CategorySuggestion = { txId: string; categoryName: string; confidence: number };

/** What the prompt shows Claude about each transaction. */
type TxForAI = {
  id: string;
  description: string;
  merchantRaw: string | null;
  amount: number;
  date: Date;
  paymentMethod: string | null;
  counterpartyName: string | null;
  counterpartyType: string | null;
  merchantName: string | null;
  merchantCnae: string | null;
  mcc: number | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  pluggyCategory: string | null;
  account: { type: string };
};

/**
 * Asks Claude for a category per transaction (Brazilian rules in the system prompt, cached).
 * Only talks to the API: applying the suggestions is up to the caller (jobs/categorize.ts).
 * Throws on API errors and on unparseable output.
 */
export async function suggestCategories(remaining: TxForAI[], categories: { name: string; group: string | null }[]) {
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

  const usage = {
    input: resp.usage.input_tokens,
    output: resp.usage.output_tokens,
    cacheRead: resp.usage.cache_read_input_tokens ?? 0,
    cacheCreation: resp.usage.cache_creation_input_tokens ?? 0,
  };
  return { suggestions: parsed.suggestions as CategorySuggestion[], usage };
}
