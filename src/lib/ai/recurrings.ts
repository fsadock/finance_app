import { getAnthropic, MODEL_FAST } from "@/lib/ai/client";
import { prisma } from "@/lib/infra/db";
import { groupingKey, normalizeForGrouping } from "@/lib/domain/merchant";
import {
  RECURRING_LOOKBACK_MONTHS,
  RECURRING_CV_THRESHOLD,
  RECURRING_MIN_CONFIDENCE,
  RECURRING_MIN_OCCURRENCES,
} from "@/lib/domain/constants";
import { withRetry } from "@/lib/infra/retry";
import { logger } from "@/lib/infra/logger";
import {
  CADENCES,
  inferCadence,
  nextDueDate,
  type Cadence,
} from "@/lib/domain/recurrence";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

type Sample = { id: string; description: string; counterpartyName?: string | null; amount: number; date: Date; categoryId: string | null };
type Candidate = { key: string; pattern: string; samples: Sample[]; avgAmount: number; inferred: Cadence | null };

/** Groups outflows and inflows by merchant, keeping groups with a stable amount. */
function buildRecurringCandidates(txs: Sample[], knownPatterns: Set<string>): Candidate[] {
  const groups = new Map<string, Sample[]>();
  for (const t of txs) {
    const pattern = groupingKey(t);
    if (!pattern || knownPatterns.has(pattern)) continue;
    const key = `${t.amount < 0 ? "out" : "in"}:${pattern}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const candidates: Candidate[] = [];
  for (const [key, list] of groups) {
    if (list.length < RECURRING_MIN_OCCURRENCES) continue;
    const amts = list.map((l) => l.amount);
    const avg = amts.reduce((s, x) => s + x, 0) / amts.length;
    const stddev = Math.sqrt(amts.reduce((s, x) => s + (x - avg) ** 2, 0) / amts.length);
    if (Math.abs(stddev / avg) > RECURRING_CV_THRESHOLD) continue;
    candidates.push({
      key,
      pattern: key.slice(key.indexOf(":") + 1),
      samples: list,
      avgAmount: avg,
      inferred: inferCadence(list.map((l) => l.date)),
    });
  }
  return candidates;
}

export async function detectRecurrings() {
  const since = new Date();
  since.setMonth(since.getMonth() - RECURRING_LOOKBACK_MONTHS);

  const [txs, categories, existing] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        date: { gte: since },
        recurringId: null,
        // card installments ("parcelado") look monthly but are a single purchase, not a subscription
        totalInstallments: null,
        // transfers and excluded categories (card payments, investments) are not bills/income
        transferPairId: null,
        excludeFromBudget: false,
        OR: [{ categoryId: null }, { category: { excludeFromBudget: false } }],
      },
      select: { id: true, description: true, counterpartyName: true, amount: true, date: true, categoryId: true },
      orderBy: { date: "asc" },
    }),
    prisma.category.findMany({ where: { excludeFromBudget: false } }),
    prisma.recurring.findMany({ select: { name: true, pattern: true } }),
  ]);

  const knownPatterns = new Set(existing.map((e) => e.pattern ?? normalizeForGrouping(e.name)).filter(Boolean));
  const candidates = buildRecurringCandidates(txs, knownPatterns);
  if (candidates.length === 0) return { detected: 0 };

  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const catByName = new Map(categories.map((c) => [c.name, c.id]));
  const candidateText = candidates
    .map((c, i) => {
      const dates = c.samples.map((s) => s.date.toISOString().slice(0, 10)).join(", ");
      const sample = c.samples[c.samples.length - 1]!.description.slice(0, 80);
      const cat = c.samples.find((s) => s.categoryId)?.categoryId;
      return (
        `${i}. ${sample} | ${c.avgAmount < 0 ? "saída" : "entrada"} média ${Math.abs(c.avgAmount).toFixed(2)} | ` +
        `${c.samples.length} ocorrências em [${dates}] | cadência estimada: ${c.inferred ?? "irregular"} | ` +
        `categoria atual: ${cat ? catName.get(cat) : "sem categoria"}`
      );
    })
    .join("\n");

  const DetectedSchema = z.object({
    detected: z.array(
      z.object({
        candidate: z.number().int(),
        name: z.string(),
        cadence: z.enum(CADENCES),
        categoryName: z.enum(categories.map((c) => c.name) as [string, ...string[]]).nullable(),
        confidence: z.number(),
      })
    ),
  });

  const anthropic = await getAnthropic();
  const resp = await withRetry(() =>
    anthropic.messages.parse({
      model: MODEL_FAST,
      max_tokens: 4000,
      system: [
        {
          type: "text",
          text:
            "Você analisa grupos de transações bancárias brasileiras para detectar lançamentos recorrentes: " +
            "assinaturas, contas fixas (aluguel, luz, internet, escola, seguros) e receitas recorrentes (salário, aluguel recebido). " +
            "Compras repetidas no mesmo comerciante sem periodicidade (mercado, restaurante, Uber) NÃO são recorrentes. " +
            "Para cada candidato realmente recorrente, retorne: candidate = o número do candidato; name = nome amigável " +
            "do serviço ou conta; cadence; categoryName da lista (ou null); confidence entre 0 e 1. " +
            "Omita candidatos que não são recorrentes.\n\nCategorias disponíveis:\n" +
            categories.map((c) => `- ${c.name}`).join("\n"),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: `Candidatos:\n\n${candidateText}` }],
      output_config: { format: zodOutputFormat(DetectedSchema) },
    })
  );
  const parsed = resp.parsed_output;
  if (!parsed) throw new Error(`Claude returned no parseable output (stop_reason=${resp.stop_reason})`);

  let saved = 0;
  const used = new Set<number>();
  for (const d of parsed.detected) {
    const c = candidates[d.candidate];
    if (!c || used.has(d.candidate) || d.confidence < RECURRING_MIN_CONFIDENCE) continue;
    used.add(d.candidate);

    const lastDate = c.samples[c.samples.length - 1]!.date;
    const rec = await prisma.recurring.create({
      data: {
        name: d.name,
        pattern: c.pattern,
        amount: Math.round(c.avgAmount * 100) / 100,
        cadence: d.cadence,
        categoryId: d.categoryName ? catByName.get(d.categoryName) : undefined,
        lastDate,
        nextDate: nextDueDate(lastDate, d.cadence),
        confidence: d.confidence,
        detectedByAI: true,
      },
    });
    await prisma.transaction.updateMany({
      where: { id: { in: c.samples.map((s) => s.id) } },
      data: { isRecurring: true, recurringId: rec.id },
    });
    saved++;
  }

  logger.info("ai:recurrings", {
    candidates: candidates.length,
    detected: saved,
    input: resp.usage.input_tokens,
    output: resp.usage.output_tokens,
    cacheRead: resp.usage.cache_read_input_tokens ?? 0,
  });
  return { detected: saved };
}

