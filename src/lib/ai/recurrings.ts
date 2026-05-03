import { getAnthropic, MODEL_FAST } from "./client";
import { prisma } from "../db";
import { normalizeForGrouping, normalizeMerchant } from "./merchant";
import {
  RECURRING_LOOKBACK_MONTHS,
  RECURRING_CV_THRESHOLD,
  RECURRING_MIN_CONFIDENCE,
  RECURRING_MIN_OCCURRENCES,
} from "../constants";
import { withRetry } from "../retry";

type DetectedRecurring = {
  name: string;
  amount: number;
  cadence: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  categoryName?: string;
  confidence: number;
  reasoning: string;
};

export async function detectRecurrings() {
  const since = new Date();
  since.setMonth(since.getMonth() - RECURRING_LOOKBACK_MONTHS);

  const [txs, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        date: { gte: since },
        amount: { lt: 0 },
        isRecurring: false,
        // Skip tx paired as transfer or excluded from budget — those are not recurring "bills"
        transferPairId: null,
        excludeFromBudget: false,
        // Skip tx already in transfer/payment categories (e.g. "Pagamento de fatura")
        OR: [{ categoryId: null }, { category: { excludeFromBudget: false } }],
      },
      select: { id: true, description: true, amount: true, date: true, categoryId: true },
      orderBy: { date: "asc" },
    }),
    prisma.category.findMany({ where: { excludeFromBudget: false } }),
  ]);

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const catByName = new Map(categories.map((c) => [c.name, c.id]));

  // Group by refined merchant for grouping
  const groups = new Map<string, typeof txs>();
  for (const t of txs) {
    const k = normalizeForGrouping(t.description);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  // Candidates: ≥2 occurrences with similar amount (broad net; AI filters noise)
  const candidates: { merchant: string; samples: typeof txs; avgAmount: number }[] = [];
  for (const [merchant, list] of groups) {
    if (list.length < RECURRING_MIN_OCCURRENCES) continue;
    const amts = list.map((l) => l.amount);
    const avg = amts.reduce((s, x) => s + x, 0) / amts.length;
    const stddev = Math.sqrt(amts.reduce((s, x) => s + (x - avg) ** 2, 0) / amts.length);
    const cv = Math.abs(stddev / avg);
    if (cv > RECURRING_CV_THRESHOLD) continue;
    candidates.push({ merchant, samples: list, avgAmount: avg });
  }
  if (candidates.length === 0) return { detected: 0, candidates: [] as DetectedRecurring[] };

  // Skip AI for candidates whose merchant pattern matches an already-saved recurring
  const existing = await prisma.recurring.findMany({ select: { name: true } });
  const existingPatterns = new Set(existing.map((e) => normalizeForGrouping(e.name)).filter(Boolean));
  const novelCandidates = candidates.filter((c) => !existingPatterns.has(c.merchant));
  if (novelCandidates.length === 0) return { detected: 0, candidates: [] as DetectedRecurring[] };

  const client = getAnthropic();
  const candidateText = novelCandidates
    .map((c, i) => {
      const dates = c.samples.map((s) => s.date.toISOString().slice(0, 10)).join(", ");
      const sample = c.samples[0]!.description.replace(/[`"'\\]/g, "").slice(0, 60);
      const cat = c.samples.find((s) => s.categoryId)?.categoryId;
      const catName = cat ? catMap.get(cat) : "Sem categoria";
      return `${i + 1}. ${sample} | valor médio ${c.avgAmount.toFixed(2)} | ${c.samples.length} ocorrências em [${dates}] | Categoria atual: ${catName}`;
    })
    .join("\n");

  const categoryList = categories.map((c) => `- ${c.name}`).join("\n");

  const resp = await withRetry(() => client.messages.create({
    model: MODEL_FAST,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text:
          "Você analisa padrões de transações para detectar pagamentos recorrentes (assinaturas, contas fixas). " +
          "Para cada candidato, determine: (1) é realmente recorrente? (2) qual cadência (WEEKLY/BIWEEKLY/MONTHLY/QUARTERLY/YEARLY)? (3) categoria apropriada da lista; (4) confiança (0-1). " +
          "Responda APENAS JSON: " +
          `{"detected":[{"name":"...","amount":-99.9,"cadence":"MONTHLY","categoryName":"...","confidence":0.9,"reasoning":"..."}]}. ` +
          "name = nome amigável do serviço/conta. amount = valor médio (negativo). " +
          "Inclua APENAS itens com confidence >= 0.7.\n\n" +
          "Categorias disponíveis:\n" +
          categoryList,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analise estes candidatos a recorrências:\n\n${candidateText}\n\nResponda apenas o JSON.`,
      },
    ],
  }));

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No response");
  const m = textBlock.text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Invalid JSON from Claude");
  const parsed = JSON.parse(m[0]) as { detected: DetectedRecurring[] };

  const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));

  let saved = 0;
  for (const d of parsed.detected) {
    if (existingNames.has(d.name.toLowerCase())) continue;
    if (d.confidence < RECURRING_MIN_CONFIDENCE) continue;
    
    const catId = d.categoryName ? catByName.get(d.categoryName) : undefined;
    const next = new Date();
    next.setMonth(next.getMonth() + 1);

    const rec = await prisma.recurring.create({
      data: {
        name: d.name,
        amount: d.amount,
        cadence: d.cadence,
        categoryId: catId,
        nextDate: next,
        confidence: d.confidence,
        detectedByAI: true,
      },
    });
    // Mark matching tx as recurring so they don't recandidate next run
    const pattern = normalizeForGrouping(d.name);
    if (pattern) {
      const matched = novelCandidates.find((c) => c.merchant === pattern);
      if (matched) {
        await prisma.transaction.updateMany({
          where: { id: { in: matched.samples.map((s) => s.id) } },
          data: { isRecurring: true, recurringId: rec.id },
        });
      }
    }
    saved++;
  }

  return {
    detected: saved,
    candidates: parsed.detected,
    usage: {
      input: resp.usage.input_tokens,
      output: resp.usage.output_tokens,
      cacheRead: resp.usage.cache_read_input_tokens ?? 0,
    },
  };
}
