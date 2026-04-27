import { prisma } from "./db";
import { monthBounds } from "./format";

export async function getNetWorth() {
  const accounts = await prisma.account.findMany({ where: { hidden: false } });
  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    if (a.balance >= 0) assets += a.balance;
    else debts += Math.abs(a.balance);
  }
  const investments = await prisma.investment.findMany();
  const investmentsValue = investments.reduce((s, i) => s + i.currentPrice * i.quantity, 0);
  return { assets: assets + investmentsValue, debts, net: assets + investmentsValue - debts };
}

export async function getMonthSpend(month = new Date()) {
  const { start, end } = monthBounds(month);
  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      excludeFromBudget: false,
      OR: [{ categoryId: null }, { category: { excludeFromBudget: false } }],
    },
    select: { amount: true },
  });
  let spent = 0;
  let income = 0;
  for (const t of txs) {
    if (t.amount < 0) spent += Math.abs(t.amount);
    else income += t.amount;
  }
  return { spent, income };
}

export async function getTopCategories(month = new Date(), limit = 6) {
  const { start, end } = monthBounds(month);
  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      date: { gte: start, lt: end },
      amount: { lt: 0 },
      categoryId: { not: null },
      category: { excludeFromBudget: false },
    },
    _sum: { amount: true },
  });
  const cats = await prisma.category.findMany({
    where: { id: { in: grouped.map((g) => g.categoryId!).filter(Boolean) } },
  });
  const map = new Map(cats.map((c) => [c.id, c]));
  return grouped
    .map((g) => ({
      category: map.get(g.categoryId!)!,
      spent: Math.abs(g._sum.amount ?? 0),
    }))
    .filter((x) => x.category)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, limit);
}

export async function getReviewTransactions(limit = 8) {
  return prisma.transaction.findMany({
    where: { status: "REVIEW" },
    include: { account: true, category: true },
    orderBy: { date: "desc" },
    take: limit,
  });
}

export async function getUpcomingRecurrings(limit = 6) {
  return prisma.recurring.findMany({
    where: { active: true },
    include: { account: true, category: true },
    orderBy: { nextDate: "asc" },
    take: limit,
  });
}

export async function getGoals() {
  return prisma.goal.findMany({ orderBy: { createdAt: "asc" } });
}

export async function getMonthlyCashflow(monthsBack = 6) {
  const start = new Date();
  start.setMonth(start.getMonth() - monthsBack + 1);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: start },
      excludeFromBudget: false,
      OR: [{ categoryId: null }, { category: { excludeFromBudget: false } }],
    },
    select: { amount: true, date: true },
  });
  const buckets = new Map<string, { income: number; spend: number }>();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(k, { income: 0, spend: 0 });
  }
  for (const t of txs) {
    const d = new Date(t.date);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(k);
    if (!b) continue;
    if (t.amount < 0) b.spend += Math.abs(t.amount);
    else b.income += t.amount;
  }
  return Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v, net: v.income - v.spend }));
}

export async function getMonthBudgetProgress(month = new Date()) {
  const { start, end } = monthBounds(month);
  const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const budgets = await prisma.budget.findMany({
    where: { startMonth: monthStr },
    include: { category: true },
  });
  const grouped = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      date: { gte: start, lt: end },
      amount: { lt: 0 },
      categoryId: { in: budgets.map((b) => b.categoryId) },
    },
    _sum: { amount: true },
  });
  const spentMap = new Map(grouped.map((g) => [g.categoryId, Math.abs(g._sum.amount ?? 0)]));
  return budgets.map((b) => ({
    budget: b,
    spent: spentMap.get(b.categoryId) ?? 0,
    pct: ((spentMap.get(b.categoryId) ?? 0) / b.monthlyLimit) * 100,
  }));
}
