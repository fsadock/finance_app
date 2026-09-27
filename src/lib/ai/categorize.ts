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
 * Regras de classificação. Mandado como system com cache_control, então cresce de graça na segunda chamada —
 * mas cada regra aqui é uma que o usuário não precisa corrigir à mão depois.
 */
const SYSTEM_PROMPT = (categoryList: string) => `Você é um classificador de transações bancárias brasileiras.
Para cada transação, escolha a categoria mais apropriada da lista no fim. Valores negativos são saídas; positivos, entradas.
Cada linha traz contexto estruturado (método, contraparte CPF/CNPJ, comerciante, CNAE, MCC, parcela, categoria do banco) — use-o antes da descrição.

COMO LER A DESCRIÇÃO (o nome do comerciante costuma estar escondido):
- Prefixos do banco não significam nada: "COMPRA DEBITO APP VISA - X - DOCTO: 123" e "COMPRA CARTAO VISA - X" são a compra em X. Ignore o "DOCTO: n" no fim.
- Marcadores de adquirente/subadquirente vêm antes do comerciante real, separados por "*": EBN*, ZIG*, CAPPTA*, DL*, SPG*, PAG*, MP*, PICPAY*, SUMUP*, STONE*, GLOBO*, AMAZONMKTPLC*. Classifique pelo que vem DEPOIS do "*" (ex.: "EBN*SPOTIFY" é Spotify).
- "IFD*" é iFood. "PIX RECEBIDO - REM FULANO - 12/05" é um Pix recebido de Fulano.
- Sem nome reconhecível (só números, "COBRANCA", "DEBITO AUTORIZADO"), prefira "Outros" com confidence baixa a chutar.

APP DE ENTREGA: quem decide é a LOJA, não o aplicativo.
- iFood/Rappi/Daki + restaurante, lanchonete, pizzaria, hamburgueria: "Delivery"
- iFood/Rappi/Daki + drogaria ou farmácia: "Farmácia"
- iFood/Rappi/Daki + petshop ou ração: "Pets"
- Daki/Rappi + mercado, hortifruti, bebidas: "Mercado"
- Assinatura do app (iFood Clube, Rappi Prime): "Assinaturas"

PIX / TED / DOC — o método NÃO define a categoria, o destinatário define:
- Saída para o próprio titular (mesma titularidade): "Transferências"
- Entrada vinda do próprio titular, inclusive quando o remetente tem o MESMO NOME do dono da conta: "Transferências" (é dinheiro trazido de outro banco dele, não receita)
- Contraparte é empresa (CNPJ): é compra/pagamento — classifique pelo nome do comerciante
- Saída para pessoa física (CPF): use o nome/descrição (aluguel → Aluguel, diarista → Contas de casa, professor → Educação, médico/psicólogo → Saúde); sem pista, "Pagamentos a pessoas"
- Entrada de pessoa física (CPF): geralmente "Reembolsos" (divisão de conta, devolução), salvo indício de salário
- Sem contraparte identificada: só é "Transferências" se a descrição indicar conta própria; caso contrário trate como pagamento pelo nome

CARTÃO DE CRÉDITO:
- Pagamento de fatura ("PAGAMENTO RECEBIDO", "PAG FATURA", "InvoiceCreditCardBankslip", débito automático da fatura): "Pagamento de fatura"
- Estorno/crédito de compra: mesma categoria da compra original; cashback: "Reembolsos"
- Compras parceladas: categoria do comerciante, como qualquer compra
- IOF, juros, encargos de rotativo, "PARC.FACIL", multa, anuidade, tarifa, cesta de serviços ("Cesta Exclusive"), seguro do cartão: "Tarifas & Juros"

CONTA / INVESTIMENTOS / RENDA:
- Aplicação, resgate, RDB, CDB, caixinha, porquinho, poupança, Tesouro, corretora: "Investimentos"
- PGBL, VGBL, previdência: "Previdência privada"
- Rendimento de saldo em conta ("RENTAB.INVEST", "rendimento"), juros recebidos, dividendos, JCP: "Rendimentos"
- Salário, folha, proventos, férias, 13º, PLR: "Salário"
- Boleto: classifique pelo beneficiário (condomínio, luz, água, gás → Contas de casa; escola → Educação)

COMERCIANTES COMUNS:
- Apple, apple.com/bill, iCloud, Microsoft 365, Google One, ChatGPT, Notion, GitHub: "Tecnologia & Software"; cobranças pequenas e repetidas da Apple/Google costumam ser "Assinaturas"
- Netflix, Spotify, Disney+, HBO/Max, Globoplay, Prime Video, YouTube Premium, Deezer: "Streaming"
- Barbearia, cabeleireiro, salão, estética, cosmético, manicure, Beleza na Web: "Cuidados pessoais"
- Supermercado (Pão de Açúcar, Carrefour, Extra, Atacadão, Assaí, EPA, Verdemar), padaria de bairro: "Mercado"
- Uber, 99, InDriver, Cabify: "Apps de mobilidade"; metrô, BRT, ônibus, bilhete único: "Transporte"
- Posto de combustível (Shell, Ipiranga, BR, Petrobras): "Combustível"; Sem Parar, ConectCar, Veloe, estacionamento, administradora de shopping em valor pequeno: "Estacionamento & Pedágio"
- Drogasil, Drogaria São Paulo, Pague Menos, Araújo, Raia: "Farmácia"; plano de saúde, clínica, laboratório, hospital, ótica: "Saúde"
- Smartfit, Bluefit, Gympass/Wellhub: "Academia"
- Cinema, Ingresso.com, Sympla, boate, bar dançante, parque: "Lazer"
- Mercado Livre, Amazon, Shopee, Magalu, Casas Bahia: olhe o item se descrito; sem pista, "Outros" com confidence baixa
- eSIM (Airalo), operadora (Vivo, Claro, TIM), internet: "Internet & Telefone"
- Aeroporto, companhia aérea, hotel, Booking, Airbnb: "Viagem"
- IPVA, IPTU, DARF, DAS, Receita Federal, licenciamento: "Impostos & Taxas"
- Porto Seguro, SulAmérica, seguro auto/vida/residencial: "Seguros"
- Petshop, ração, veterinário: "Pets"

Retorne uma sugestão por transação, com o id exatamente como recebido e confidence entre 0 e 1.
Confidence alta (>0.8) só quando o comerciante estiver claro; na dúvida use "Outros" com confidence baixa (<0.5) — é melhor deixar para o usuário do que categorizar errado com confiança.

Categorias disponíveis:
${categoryList}`;

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

  // categoryName como texto livre, validado depois: uma resposta fora da lista descartava o lote inteiro
  // de 40 transações, e bastava um Pix para isso acontecer.
  const SuggestionsSchema = z.object({
    suggestions: z.array(z.object({ txId: z.string(), categoryName: z.string(), confidence: z.number() })),
  });

  const client = await getAnthropic();
  const resp = await withRetry(() =>
    client.messages.parse({
      model: MODEL_FAST,
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT(categoryList),
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

  const known = new Set(categoryNames);
  const suggestions = (parsed.suggestions as CategorySuggestion[]).filter((s) => known.has(s.categoryName));
  if (suggestions.length < parsed.suggestions.length) {
    const invalidas = [...new Set(parsed.suggestions.filter((s) => !known.has(s.categoryName)).map((s) => s.categoryName))];
    logger.warn("ai:categorize_invalid_category", { invalidas });
  }

  const usage = {
    input: resp.usage.input_tokens,
    output: resp.usage.output_tokens,
    cacheRead: resp.usage.cache_read_input_tokens ?? 0,
    cacheCreation: resp.usage.cache_creation_input_tokens ?? 0,
  };
  return { suggestions, usage };
}
