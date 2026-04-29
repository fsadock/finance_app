import { prisma } from "./db";
import { monthBounds } from "./format";
import { normalizeForGrouping } from "./ai/merchant";

export async function getNetWorth() {
  const accounts = await prisma.account.findMany({ where: { hidden: false } });
  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    if (a.balance >= 0) assets += a.balance;
    else debts += Math.abs(a.balance);
  }
  return { assets: assets, debts, net: assets - debts };
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

export async function getSpendingPace(month = new Date()) {
  const { start, end } = monthBounds(month);
  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      amount: { lt: 0 },
      excludeFromBudget: false,
      OR: [{ categoryId: null }, { category: { excludeFromBudget: false } }],
    },
    select: { amount: true, date: true },
    orderBy: { date: "asc" },
  });

  const budgets = await prisma.budget.findMany({
    where: { startMonth: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}` },
  });
  const totalBudget = budgets.reduce((s, b) => s + b.monthlyLimit, 0);

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const data: { day: number; actual: number; ideal: number }[] = [];

  let cumulative = 0;
  const dayMap = new Map<number, number>();
  for (const t of txs) {
    const d = new Date(t.date).getDate();
    dayMap.set(d, (dayMap.get(d) ?? 0) + Math.abs(t.amount));
  }

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth();
  const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;

  for (let i = 1; i <= daysInMonth; i++) {
    cumulative += dayMap.get(i) ?? 0;
    data.push({
      day: i,
      actual: i <= currentDay ? cumulative : (null as any),
      ideal: (totalBudget / daysInMonth) * i,
    });
  }

  return { data, totalBudget, currentSpend: cumulative };
}

export async function getNetWorthHistory(monthsBack = 12) {
  const current = await getNetWorth();
  const cashflow = await getMonthlyCashflow(monthsBack);
  
  const history: { month: string; value: number }[] = [];
  let runningValue = current.net;

  // Monthly cashflow is in ascending order (past to present)
  // To reconstruct history:
  // Current Month: runningValue
  // Prev Month: runningValue - currentMonthNet
  
  // Actually, getMonthlyCashflow returns [oldest, ..., newest]
  // So we should iterate backwards from current.
  const reversed = [...cashflow].reverse();
  
  for (const month of reversed) {
    history.push({ month: month.month, value: runningValue });
    runningValue -= month.net;
  }

  return history.reverse();
}

export async function getSankeyData(month = new Date()) {
  const { start, end } = monthBounds(month);
  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lt: end },
      excludeFromBudget: false,
      OR: [{ categoryId: null }, { category: { excludeFromBudget: false } }],
    },
    include: { category: true },
  });

  const recurrings = await prisma.recurring.findMany({ where: { active: true } });
  const recurringPatterns = new Set(recurrings.map(r => normalizeForGrouping(r.name)));

  let income = 0;
  let fixed = 0;
  const categoriesMap = new Map<string, number>();

  for (const t of txs) {
    if (t.amount > 0) {
      income += t.amount;
    } else {
      const abs = Math.abs(t.amount);
      const isFixed = recurringPatterns.has(normalizeForGrouping(t.description));
      if (isFixed) {
        fixed += abs;
      } else {
        const catName = t.category?.name ?? "Outros";
        categoriesMap.set(catName, (categoriesMap.get(catName) ?? 0) + abs);
      }
    }
  }

  const variable = Array.from(categoriesMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const totalSpent = fixed + variable.reduce((s, v) => s + v.value, 0);
  const savings = Math.max(0, income - totalSpent);

  return { income, fixed, variable, savings, totalSpent };
}

/**
 * Calculates the effective budget for a category in a given month,
 * including rollovers (surplus/deficit) from previous months if enabled.
 * Recursion depth limited to 6 months.
 */
export async function getEffectiveBudget(categoryId: string, month: Date, depth = 0): Promise<number> {
  const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
  const [budget, category] = await Promise.all([
    prisma.budget.findUnique({
      where: { categoryId_startMonth: { categoryId, startMonth: monthStr } },
    }),
    prisma.category.findUnique({
      where: { id: categoryId },
      select: { rolloverEnabled: true },
    }),
  ]);

  const limit = budget?.monthlyLimit ?? 0;
  if (!category?.rolloverEnabled || depth >= 6) {
    return limit;
  }

  const prevMonth = new Date(month);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const { start, end } = monthBounds(prevMonth);

  const [prevSpentResult, prevEffective] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        categoryId,
        date: { gte: start, lt: end },
        excludeFromBudget: false,
      },
      _sum: { amount: true },
    }),
    getEffectiveBudget(categoryId, prevMonth, depth + 1),
  ]);

  const prevSpent = Math.abs(prevSpentResult._sum.amount ?? 0);
  const rollover = prevEffective - prevSpent;

  return limit + rollover;
}

export async function getCCSpendingData(month = new Date()) {
  const { start, end } = monthBounds(month);

  const config = await prisma.appConfig.findUnique({ where: { key: "cc_monthly_limit" } });
  const totalBudget = config ? parseFloat(config.value) : 0;

  const txs = await prisma.transaction.findMany({
    where: {
      account: { type: "CREDIT_CARD" },
      date: { gte: start, lt: end },
      amount: { lt: 0 },
      excludeFromBudget: false,
    },
    select: { amount: true, date: true },
    orderBy: { date: "asc" },
  });

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth();
  const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;

  const dayMap = new Map<number, number>();
  for (const t of txs) {
    const d = new Date(t.date).getDate();
    dayMap.set(d, (dayMap.get(d) ?? 0) + Math.abs(t.amount));
  }

  const data: { day: number; ccActual: number | null; ccIdeal: number }[] = [];
  let cumulative = 0;
  for (let i = 1; i <= daysInMonth; i++) {
    cumulative += dayMap.get(i) ?? 0;
    data.push({
      day: i,
      ccActual: i <= currentDay ? cumulative : null,
      ccIdeal: totalBudget > 0 ? (totalBudget / daysInMonth) * i : 0,
    });
  }

  const daysLeft = Math.max(1, daysInMonth - currentDay + 1);
  const dailyAvg = currentDay > 0 ? cumulative / currentDay : 0;
  const projected = dailyAvg * daysInMonth;
  const remaining = Math.max(0, totalBudget - cumulative);
  const dailyAllowance = totalBudget > 0 && remaining > 0 ? remaining / daysLeft : 0;

  return {
    data,
    totalBudget,
    currentSpend: cumulative,
    remaining,
    dailyAllowance,
    projected,
    isOverBudget: totalBudget > 0 && cumulative > totalBudget,
    isOverPace: totalBudget > 0 && projected > totalBudget,
  };
}

export async function getAccountPacing(accountId: string, month = new Date()) {
  const { start, end } = monthBounds(month);
  
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { personalLimit: true },
  });

  const txs = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: start, lt: end },
      amount: { lt: 0 },
      excludeFromBudget: false,
    },
    select: { amount: true, date: true },
  });

  const spent = txs.reduce((s, t) => s + Math.abs(t.amount), 0);
  const limit = account?.personalLimit ?? 0;

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === month.getFullYear() && today.getMonth() === month.getMonth();
  const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;
  const daysLeft = Math.max(1, daysInMonth - currentDay + 1);

  const dailyAvg = currentDay > 0 ? spent / currentDay : 0;
  const projected = dailyAvg * daysInMonth;
  const dailyAllowance = limit > spent ? (limit - spent) / daysLeft : 0;

  return {
    spent,
    limit,
    projected,
    dailyAllowance,
    isOverPace: projected > limit,
    daysLeft,
  };
}

export async function getRebalanceSuggestions(month = new Date()) {
  const budgets = await getMonthBudgetProgress(month);

  const surplus = budgets
    .filter((b) => b.spent < b.budget.monthlyLimit)
    .map((s) => ({
      id: s.budget.categoryId,
      name: s.budget.category.name,
      available: s.budget.monthlyLimit - s.spent,
    }));

  const deficits = budgets
    .filter((b) => b.spent > b.budget.monthlyLimit)
    .map((d) => ({
      id: d.budget.categoryId,
      name: d.budget.category.name,
      needed: d.spent - d.budget.monthlyLimit,
    }));

  const suggestions: {
    fromId: string;
    fromName: string;
    toId: string;
    toName: string;
    amount: number;
  }[] = [];

  let sIdx = 0;
  let dIdx = 0;

  while (sIdx < surplus.length && dIdx < deficits.length) {
    const s = surplus[sIdx]!;
    const d = deficits[dIdx]!;

    const move = Math.min(s.available, d.needed);
    if (move > 1) {
      suggestions.push({
        fromId: s.id,
        fromName: s.name,
        toId: d.id,
        toName: d.name,
        amount: move,
      });
    }

    s.available -= move;
    d.needed -= move;

    if (s.available <= 0) sIdx++;
    if (d.needed <= 0) dIdx++;
  }

  return suggestions;
}
