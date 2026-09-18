import { prisma } from "@/lib/infra/db";
import { DAY_MS, startOfDay } from "@/lib/domain/format";
import {
  CADENCE_TO_MONTHLY,
  isLikelyInactive,
  nextOccurrence,
  priceTrend,
  type AutoChangeRecord,
  type Cadence,
} from "@/lib/domain/recurrence";

/**
 * Active recurrings with `nextDate` rolled forward past stale dates, plus cost facts for deciding what to cut:
 * monthly/yearly equivalent, what was actually paid in the last 12 months and the price change since the first charge.
 */
export async function getActiveRecurrings() {
  const today = startOfDay(new Date());
  const yearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const recurrings = await prisma.recurring.findMany({
    where: { active: true },
    include: { account: true, category: true },
  });
  const linked = await prisma.transaction.findMany({
    where: { recurringId: { in: recurrings.map((r) => r.id) }, date: { lte: today } },
    select: { recurringId: true, amount: true, date: true },
    orderBy: { date: "asc" },
  });
  const byRecurring = new Map<string, { amount: number; date: Date }[]>();
  for (const t of linked) byRecurring.set(t.recurringId!, [...(byRecurring.get(t.recurringId!) ?? []), t]);

  return recurrings
    .map((r) => {
      const charges = byRecurring.get(r.id) ?? [];
      // After a user edit, their amount is the new baseline: only later charges are compared.
      const trend = priceTrend(r.editedAt ? charges.filter((c) => c.date > r.editedAt!) : charges, r.cadence as Cadence);
      const autoChange = r.autoChange ? (JSON.parse(r.autoChange) as AutoChangeRecord) : null;
      const monthly = Math.abs(r.amount) * CADENCE_TO_MONTHLY[r.cadence as Cadence];
      return {
        ...r,
        upcoming: nextOccurrence(r.nextDate, r.cadence as Cadence, today),
        likelyInactive: isLikelyInactive(r.lastDate, r.cadence as Cadence, today),
        monthly,
        yearly: monthly * 12,
        paidLast12m: charges.filter((c) => c.date >= yearAgo).reduce((s, c) => s + Math.abs(c.amount), 0),
        chargesLast12m: charges.filter((c) => c.date >= yearAgo),
        firstCharge: trend ? { amount: Math.abs(trend.first.amount), date: trend.first.date } : null,
        // charge vs charge, only within the current plan (monthly → yearly must not read as +32%)
        priceChange: trend?.change ?? 0,
        // shown for 30 days, with an undo
        autoChange: autoChange && today.getTime() - new Date(autoChange.at).getTime() < 30 * DAY_MS ? autoChange : null,
      };
    })
    .sort((a, b) => a.upcoming.getTime() - b.upcoming.getTime());
}

/** Paused recurrings (cancelled or not really recurring), most recent charge first. */
export function getPausedRecurrings() {
  return prisma.recurring.findMany({ where: { active: false }, orderBy: { lastDate: "desc" } });
}
