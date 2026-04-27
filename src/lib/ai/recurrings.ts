import { getAnthropic, MODEL_FAST } from "./client";
import { prisma } from "../db";

type DetectedRecurring = {
  name: string;
  amount: number;
  cadence: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  confidence: number;
  reasoning: string;
};

function normalizeMerchant(s: string) {
  return s
    .toLowerCase()
    .replace(/\d+/g, "")
    .replace(/[^a-záéíóúâêôãõç\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function detectRecurrings() {
  const since = new Date();
  since.setMonth(since.getMonth() - 6);

  const txs = await prisma.transaction.findMany({
    where: { date: { gte: since }, amount: { lt: 0 }, isRecurring: false },
    select: { id: true, description: true, amount: true, date: true },
    orderBy: { date: "asc" },
  });

  // Group by normalized merchant
  const groups = new Map<string, typeof txs>();
  for (const t of txs) {
    const k = normalizeMerchant(t.description);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }

  // Candidates: ≥3 occurrences with similar amount
  const candidates: { merchant: string; samples: typeof txs; avgAmount: number }[] = [];
  for (const [merchant, list] of groups) {
    if (list.length < 3) continue;
    const amts = list.map((l) => l.amount);
    const avg = amts.reduce((s, x) => s + x, 0) / amts.length;
    const stddev = Math.sqrt(amts.reduce((s, x) => s + (x - avg) ** 2, 0) / amts.length);
    const cv = Math.abs(stddev / avg);
    if (cv > 0.15) continue;
    candidates.push({ merchant, samples: list, avgAmount: avg });
  }
  if (candidates.length === 0) return { detected: 0, candidates: [] as DetectedRecurring[] };

  const client = getAnthropic();
  const candidateText = candidates
    .map((c, i) => {
      const dates = c.samples.map((s) => s.date.toISOString().slice(0, 10)).join(", ");
      const sample = c.samples[0]!.description;
      return `${i + 1}. "${sample}" | valor médio ${c.avgAmount.toFixed(2)} | ${c.samples.length} ocorrências em [${dates}]`;
    })
    .join("\n");

  const resp = await client.messages.create({
    model: MODEL_FAST,
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text:
          "Você analisa padrões de transações para detectar pagamentos recorrentes (assinaturas, contas fixas). " +
          "Para cada candidato, determine: (1) é realmente recorrente? (2) qual cadência (WEEKLY/BIWEEKLY/MONTHLY/QUARTERLY/YEARLY)? (3) confiança (0-1). " +
          "Responda APENAS JSON: " +
          `{"detected":[{"name":"...","amount":-99.9,"cadence":"MONTHLY","confidence":0.9,"reasoning":"..."}]}. ` +
          "name = nome amigável do serviço/conta. amount = valor médio (negativo). " +
          "Inclua APENAS itens com confidence >= 0.7.",
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analise estes candidatos a recorrências:\n\n${candidateText}\n\nResponda apenas o JSON.`,
      },
    ],
  });

  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No response");
  const m = textBlock.text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Invalid JSON from Claude");
  const parsed = JSON.parse(m[0]) as { detected: DetectedRecurring[] };

  const existing = await prisma.recurring.findMany({ select: { name: true } });
  const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));

  let saved = 0;
  for (const d of parsed.detected) {
    if (existingNames.has(d.name.toLowerCase())) continue;
    if (d.confidence < 0.7) continue;
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    await prisma.recurring.create({
      data: {
        name: d.name,
        amount: d.amount,
        cadence: d.cadence,
        nextDate: next,
        confidence: d.confidence,
        detectedByAI: true,
      },
    });
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
