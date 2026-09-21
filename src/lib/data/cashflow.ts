import { prisma } from "@/lib/infra/db";
import { BUDGET_RELEVANT, FLOW_SELECT, classifyFlow, spendDelta } from "@/lib/domain/flows";
import { lastMonthKeys, monthBounds, monthKey, monthKeyToDate } from "@/lib/domain/format";

export async function getMonthlyCashflow(monthsBack = 6, anchor = new Date()) {
  const keys = lastMonthKeys(monthsBack, anchor);
  const start = monthKeyToDate(keys[0]!);
  const { end } = monthBounds(anchor);
  const txs = await prisma.transaction.findMany({
    where: { AND: [{ chargeDate: { gte: start, lt: end } }, BUDGET_RELEVANT] },
    select: { ...FLOW_SELECT, chargeDate: true },
  });
  const buckets = new Map(keys.map((k) => [k, { income: 0, spend: 0 }]));
  for (const t of txs) {
    const b = buckets.get(monthKey(t.chargeDate));
    if (!b) continue;
    if (classifyFlow(t) === "income") b.income += t.amount;
    else b.spend += spendDelta(t);
  }
  return Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v, net: v.income - v.spend }));
}

export async function getSankeyData(month = new Date()) {
  const { start, end } = monthBounds(month);
  const txs = await prisma.transaction.findMany({
    where: { AND: [{ chargeDate: { gte: start, lt: end } }, BUDGET_RELEVANT] },
    select: { ...FLOW_SELECT, recurringId: true, category: { select: { isIncome: true, name: true } } },
  });

  let income = 0;
  let fixed = 0;
  const categoriesMap = new Map<string, number>();
  for (const t of txs) {
    if (classifyFlow(t) === "income") {
      income += t.amount;
      continue;
    }
    const delta = spendDelta(t);
    // Fixed = linked to a recurring bill, the same definition as the Recorrentes page. Matching by
    // merchant name alone counted one-off purchases (an app on apple.com/bill) as fixed.
    if (t.recurringId) {
      fixed += delta;
    } else {
      const name = t.category?.name ?? "Sem categoria";
      categoriesMap.set(name, (categoriesMap.get(name) ?? 0) + delta);
    }
  }

  // Totals include every bucket (a category can net negative from refunds); the chart only draws positive flows
  const totalSpent = Math.max(0, fixed + [...categoriesMap.values()].reduce((s, v) => s + v, 0));
  const variable = Array.from(categoriesMap.entries())
    .map(([name, value]) => ({ name, value }))
    .filter((v) => v.value > 0)
    .sort((a, b) => b.value - a.value);
  fixed = Math.max(0, fixed);
  return { income, fixed, variable, savings: Math.max(0, income - totalSpent), totalSpent };
}
