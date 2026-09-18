import { prisma } from "@/lib/infra/db";
import { FLOW_SELECT, INCOME_WHERE, SPEND_WHERE, spendDelta } from "@/lib/domain/flows";
import { DAY_MS, localDayKey, monthBounds, startOfDay } from "@/lib/domain/format";

/** Spent = expenses − refunds (estornos); income = income categories / uncategorized deposits. */
export async function getMonthSpend(month = new Date()) {
  const { start, end } = monthBounds(month);
  const range = { date: { gte: start, lt: end } };
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
    where: { AND: [{ date: { gte: start, lt: end } }, SPEND_WHERE] },
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
    where: { AND: [{ date: { gte: monthStart, lt: monthEnd } }, SPEND_WHERE] },
    select: { ...FLOW_SELECT, date: true },
  });

  const monthDays = Math.round((monthEnd.getTime() - monthStart.getTime()) / DAY_MS);
  const chartDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));

  const byDay = new Map<string, number>();
  for (const t of txs) {
    const key = localDayKey(t.date);
    byDay.set(key, (byDay.get(key) ?? 0) + spendDelta(t));
  }

  const today = startOfDay(new Date());
  const data: { day: number; label: string; actual: number | null; ideal: number | null }[] = [];
  let cumulative = 0;
  for (let i = 0; i < chartDays; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const inMonth = d >= monthStart && d < monthEnd;
    if (inMonth && d <= today) cumulative += byDay.get(localDayKey(d)) ?? 0;
    data.push({
      day: i + 1,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      actual: inMonth && d <= today ? cumulative : null,
      ideal: inMonth && totalBudget > 0 ? (totalBudget / monthDays) * d.getDate() : null,
    });
  }

  const currentSpend = Math.max(0, txs.reduce((s, t) => s + spendDelta(t), 0));
  return { data, totalBudget, currentSpend };
}
