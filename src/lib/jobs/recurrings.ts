import { subMonths, subYears } from "date-fns";
import { prisma } from "@/lib/infra/db";
import { logger } from "@/lib/infra/logger";
import { errorMessage } from "@/lib/utils";
import { aiErrorMessage } from "@/lib/ai/client";
import { suggestRecurrings } from "@/lib/ai/recurrings";
import { BUDGET_RELEVANT } from "@/lib/domain/flows";
import { RECURRING_LOOKBACK_MONTHS, RECURRING_MIN_CONFIDENCE } from "@/lib/domain/constants";
import { groupingKey, isUnnamedBillPayment, normalizeForGrouping } from "@/lib/domain/merchant";
import {
  CADENCE_TO_MONTHLY,
  detectRecurringChange,
  matchUnnamedPayments,
  nextDueDate,
  nextOccurrence,
  recurringCandidates,
  type AutoChangeRecord,
  type Cadence,
  type RecurringCandidate,
} from "@/lib/domain/recurrence";

type Pick = { candidate: RecurringCandidate; name: string; cadence: Cadence; categoryId: string | null; confidence: number };

async function picksFromAI(candidates: RecurringCandidate[], categories: { id: string; name: string }[]): Promise<Pick[]> {
  const { detected, usage } = await suggestRecurrings(candidates, categories);
  logger.info("ai:recurrings", { candidates: candidates.length, detected: detected.length, ...usage });
  const catByName = new Map(categories.map((c) => [c.name, c.id]));
  const used = new Set<number>();
  const picks: Pick[] = [];
  for (const d of detected) {
    const candidate = candidates[d.candidate];
    if (!candidate || used.has(d.candidate) || d.confidence < RECURRING_MIN_CONFIDENCE) continue;
    used.add(d.candidate);
    const categoryId = d.categoryName ? (catByName.get(d.categoryName) ?? null) : null;
    picks.push({ candidate, name: d.name, cadence: d.cadence, categoryId, confidence: d.confidence });
  }
  return picks;
}

function picksWithoutAI(candidates: RecurringCandidate[]): Pick[] {
  return candidates.map((candidate) => ({
    candidate,
    name: candidate.name,
    cadence: candidate.cadence,
    categoryId: candidate.samples.findLast((s) => s.categoryId)?.categoryId ?? null,
    confidence: 1,
  }));
}

/**
 * Saves the recurrings found in the last months that aren't known yet. With AI, Claude names them and drops what
 * isn't a contract; without it, every candidate is saved under the merchant's name. An AI failure is returned,
 * not thrown, so it can be shown.
 */
export async function detectRecurrings({ useAI }: { useAI: boolean }) {
  const [txs, categories, existing] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        AND: [BUDGET_RELEVANT],
        date: { gte: subMonths(new Date(), RECURRING_LOOKBACK_MONTHS) },
        recurringId: null,
        // card installments ("parcelado") look monthly but are a single purchase, not a subscription
        totalInstallments: null,
        transferPairId: null,
      },
      select: { id: true, description: true, counterpartyName: true, amount: true, date: true, categoryId: true },
      orderBy: { date: "asc" },
    }),
    prisma.category.findMany({ where: { excludeFromBudget: false }, select: { id: true, name: true } }),
    prisma.recurring.findMany({ select: { name: true, pattern: true } }),
  ]);

  const known = new Set(existing.map((e) => e.pattern ?? normalizeForGrouping(e.name)).filter(Boolean));
  const candidates = recurringCandidates(txs, known);
  if (candidates.length === 0) return { detected: 0, aiError: null };

  let picks: Pick[];
  try {
    picks = useAI ? await picksFromAI(candidates, categories) : picksWithoutAI(candidates);
  } catch (e) {
    logger.error("ai:recurrings_failed", { error: errorMessage(e) });
    return { detected: 0, aiError: aiErrorMessage(e) };
  }

  for (const { candidate, name, cadence, categoryId, confidence } of picks) {
    const lastDate = candidate.samples.at(-1)!.date;
    const rec = await prisma.recurring.create({
      data: {
        name,
        pattern: candidate.pattern,
        amount: Math.round(candidate.avgAmount * 100) / 100,
        cadence,
        categoryId,
        lastDate,
        nextDate: nextDueDate(lastDate, cadence),
        confidence,
        detectedByAI: useAI,
      },
    });
    await prisma.transaction.updateMany({
      where: { id: { in: candidate.samples.map((s) => s.id) } },
      data: { isRecurring: true, recurringId: rec.id },
    });
  }
  return { detected: picks.length, aiError: null };
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

  const linkSince = subMonths(today, 3);
  const historySince = subMonths(today, 25);
  const yearAgo = subYears(today, 1);

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
