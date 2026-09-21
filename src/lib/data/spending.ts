import { prisma } from "@/lib/infra/db";
import { FLOW_SELECT, INCOME_WHERE, SPEND_WHERE, spendDelta } from "@/lib/domain/flows";
import { DAY_MS, monthBounds, startOfDay } from "@/lib/domain/format";
import { cumulativeSeries, sumByDay } from "@/lib/domain/series";

/** Spent = expenses − refunds (estornos); income = income categories / uncategorized deposits. */
export async function getMonthSpend(month = new Date()) {
  const { start, end } = monthBounds(month);
  const range = { chargeDate: { gte: start, lt: end } };
  const [spend, inc] = await Promise.all([
    prisma.transaction.findMany({ where: { AND: [range, SPEND_WHERE] }, select: FLOW_SELECT }),
    prisma.transaction.aggregate({ where: { AND: [range, INCOME_WHERE] }, _sum: { amount: true } }),
  ]);
  const spent = spend.reduce((s, t) => s + spendDelta(t), 0);
  return { spent: Math.max(0, spent), income: inc._sum.amount ?? 0 };
}

/** Net spend (expenses − refunds) per category for the month. */
export async function getCategorySpend(month = new Date()) {
  const { start, end } = monthBounds(month);
  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: { AND: [{ chargeDate: { gte: start, lt: end } }, SPEND_WHERE] },
    _sum: { amount: true },
  });
  return new Map(grouped.map((g) => [g.categoryId, Math.max(0, -(g._sum.amount ?? 0))]));
}

export async function getTopCategories(month = new Date(), limit = 6) {
  const [spend, cats] = await Promise.all([
    getCategorySpend(month),
    prisma.category.findMany({ where: { excludeFromBudget: false } }),
  ]);
  return cats
    .map((category) => ({ category, spent: spend.get(category.id) ?? 0 }))
    .filter((x) => x.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
}

export async function getSpendingPace(month: Date, totalBudget: number, chartStart?: Date, chartEnd?: Date) {
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const from = chartStart ?? monthStart;
  const to = chartEnd ?? monthEnd;

  const txs = await prisma.transaction.findMany({
    where: { AND: [{ chargeDate: { gte: monthStart, lt: monthEnd } }, SPEND_WHERE] },
    select: { ...FLOW_SELECT, chargeDate: true },
  });

  const monthDays = Math.round((monthEnd.getTime() - monthStart.getTime()) / DAY_MS);
  const chartDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));

  const inMonth = (d: Date) => d >= monthStart && d < monthEnd;
  const { points: data } = cumulativeSeries({
    from,
    days: chartDays,
    today: startOfDay(new Date()),
    byDay: sumByDay(txs, (t) => t.chargeDate, spendDelta),
    counts: inMonth,
    ideal: (d) => (inMonth(d) && totalBudget > 0 ? (totalBudget / monthDays) * d.getDate() : null),
  });

  const currentSpend = Math.max(0, txs.reduce((s, t) => s + spendDelta(t), 0));
  return { data, totalBudget, currentSpend };
}
