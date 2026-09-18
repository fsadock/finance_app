import { getAnthropic, MODEL_FAST } from "./client";
import { prisma } from "../db";
import { groupingKey, isUnnamedBillPayment, normalizeForGrouping } from "./merchant";
import {
  RECURRING_LOOKBACK_MONTHS,
  RECURRING_CV_THRESHOLD,
  RECURRING_MIN_CONFIDENCE,
  RECURRING_MIN_OCCURRENCES,
} from "../constants";
import { withRetry } from "../retry";
import { logger } from "../logger";
import {
  CADENCES,
  CADENCE_TO_MONTHLY,
  detectRecurringChange,
  matchUnnamedPayments,
  inferCadence,
  nextDueDate,
  nextOccurrence,
  type Cadence,
  type AutoChangeRecord,
} from "../recurrence";
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

/**
 * No-AI maintenance for known recurrings, run after every sync:
 * 1. applies a detected cadence/price change (monthly plan that became yearly, new price), unless the
 *    user undid that change or edited the recurring after its latest charge;
 * 2. links new matching transactions (same merchant key, same direction, amount within 50%), and bill
 *    payments the bank sent without a payee name when they clearly match one recurring;
 * 3. moves lastDate/nextDate forward. A next date set by the user stands until a newer charge arrives.
 */
export async function refreshRecurrings(today = new Date()) {
  const recurrings = await prisma.recurring.findMany({ where: { pattern: { not: null } } });
  if (recurrings.length === 0) return { linked: 0, changed: 0 };

  const linkSince = new Date(today);
  linkSince.setMonth(linkSince.getMonth() - 3);
  const historySince = new Date(today);
  historySince.setMonth(historySince.getMonth() - 25);
  const yearAgo = new Date(today);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const txs = await prisma.transaction.findMany({
    where: { date: { gte: historySince, lte: today }, transferPairId: null, totalInstallments: null },
    select: {
      id: true,
      description: true,
      counterpartyName: true,
      amount: true,
      date: true,
      accountId: true,
      recurringId: true,
      category: { select: { excludeFromBudget: true } },
    },
  });
  const byKey = new Map<string, typeof txs>();
  for (const t of txs) {
    const key = groupingKey(t);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), t]);
  }

  let linked = 0;
  let changed = 0;

  // 0. Bill payments without a payee name ("Utilities") can only be matched by amount, day and account.
  const unnamed = txs.filter((t) => !t.recurringId && !t.category?.excludeFromBudget && isUnnamedBillPayment(t));
  if (unnamed.length > 0) {
    const candidates = recurrings
      .filter((r) => r.active)
      .map((r) => ({
        id: r.id,
        amount: r.amount,
        cadence: r.cadence as Cadence,
        charges: txs.filter((t) => t.recurringId === r.id),
      }));
    const matched = matchUnnamedPayments(unnamed, candidates);
    for (const [txId, recurringId] of matched) {
      await prisma.transaction.update({ where: { id: txId }, data: { isRecurring: true, recurringId } });
      txs.find((t) => t.id === txId)!.recurringId = recurringId;
    }
    linked += matched.size;
  }

  for (const r of recurrings) {
    let cadence = r.cadence as Cadence;
    let amount = r.amount;
    const sameMerchant = (byKey.get(r.pattern!) ?? []).filter((t) => Math.sign(t.amount) === Math.sign(amount));

    // 1. Automatic cadence/price change. Charges already linked always count (the bank may rename the
    // merchant: "Disney Plus" → "The Walt Disney Compan"), plus same-merchant ones that weren't linked
    // (a yearly charge far from the monthly amount). A merchant with many more charges than the
    // recurring explains (iFood orders next to iFood Club) only counts the linked ones.
    let changeDate: Date | null = null;
    if (r.active) {
      const linkedCharges = txs.filter((t) => t.recurringId === r.id);
      const expectedPerYear = 12 * CADENCE_TO_MONTHLY[cadence];
      const noisy = sameMerchant.filter((t) => t.date >= yearAgo).length > expectedPerYear * 1.5 + 1;
      const charges = noisy
        ? linkedCharges
        : [...linkedCharges, ...sameMerchant.filter((t) => t.recurringId !== r.id)];
      const change = detectRecurringChange({ cadence, amount }, charges);
      if (change && change.key !== r.rejectedChange && !(r.editedAt && r.editedAt >= change.lastDate)) {
        const record: AutoChangeRecord = {
          key: change.key,
          reason: change.reason,
          from: { cadence, amount },
          to: { cadence: change.cadence, amount: change.amount },
          gapDays: change.gapDays,
          at: today.toISOString(),
        };
        await prisma.recurring.update({
          where: { id: r.id },
          data: { cadence: change.cadence, amount: change.amount, autoChange: JSON.stringify(record) },
        });
        [cadence, amount, changeDate] = [change.cadence, change.amount, change.lastDate];
        changed++;
        logger.info("recurrings:auto-change", { name: r.name, from: record.from, to: record.to });
      }
    }

    // 2. Link new charges.
    const matches = sameMerchant.filter(
      (t) => !t.recurringId && t.date >= linkSince && Math.abs(t.amount - amount) <= Math.abs(amount) * 0.5
    );
    if (matches.length > 0) {
      await prisma.transaction.updateMany({
        where: { id: { in: matches.map((m) => m.id) } },
        data: { isRecurring: true, recurringId: r.id },
      });
      linked += matches.length;
    }

    // 3. Dates.
    // Card installments come with future dates (12/12 dated next year): only charges up to today count.
    const last = await prisma.transaction.findFirst({
      where: { recurringId: r.id, date: { lte: today } },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    let lastDate = last?.date ?? r.lastDate;
    if (changeDate && (!lastDate || changeDate > lastDate)) lastDate = changeDate;
    const pinnedByUser = r.editedAt && (!lastDate || lastDate <= r.editedAt);
    const nextDate = pinnedByUser
      ? r.nextDate
      : lastDate
        ? nextDueDate(lastDate, cadence, today)
        : nextOccurrence(r.nextDate, cadence, today);
    await prisma.recurring.update({ where: { id: r.id }, data: { lastDate, nextDate } });
  }
  return { linked, changed };
}
