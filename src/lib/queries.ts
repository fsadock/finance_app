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

export async function getSpendingPace(month = new Date(), chartStart?: Date, chartEnd?: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);

  const from = chartStart ?? monthStart;
  const to = chartEnd ?? monthEnd;

  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: monthStart, lt: monthEnd },
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

  const monthDays = Math.ceil((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));
  const chartDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));

  const dateMap = new Map<string, number>();
  for (const t of txs) {
    const key = new Date(t.date).toISOString().slice(0, 10);
    dateMap.set(key, (dateMap.get(key) ?? 0) + Math.abs(t.amount));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const data: { day: number; label: string; actual: number | null; ideal: number | null }[] = [];
  let cumulative = 0;
  for (let i = 0; i < chartDays; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);

    const inCalendarMonth = d >= monthStart && d < monthEnd;
    if (inCalendarMonth && d <= today) {
      cumulative += dateMap.get(d.toISOString().slice(0, 10)) ?? 0;
    }

    const monthDayOffset = inCalendarMonth
      ? Math.floor((d.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;

    data.push({
      day: i + 1,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      actual: inCalendarMonth && d <= today ? cumulative : null,
      ideal: inCalendarMonth && totalBudget > 0 ? (totalBudget / monthDays) * monthDayOffset : null,
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
 * Batch version of getEffectiveBudget — loads all data in 3 queries instead of
 * 2*(depth+1) queries per category, eliminating the N+1 on the categories page.
 */
export async function batchGetEffectiveBudgets(
  categoryIds: string[],
  month: Date
): Promise<Map<string, number>> {
  if (categoryIds.length === 0) return new Map();

  const DEPTH = 6;

  // Build month strings [m-6, ..., m] oldest-first
  const monthStrings: string[] = [];
  for (let i = DEPTH; i >= 0; i--) {
    const d = new Date(month);
    d.setMonth(d.getMonth() - i);
    monthStrings.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const currentMonthStr = monthStrings[monthStrings.length - 1]!;

  const startDate = new Date(month);
  startDate.setMonth(startDate.getMonth() - DEPTH);
  startDate.setDate(1);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(month);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(1);
  endDate.setHours(0, 0, 0, 0);

  const [budgets, categories, transactions] = await Promise.all([
    prisma.budget.findMany({
      where: { categoryId: { in: categoryIds }, startMonth: { in: monthStrings } },
    }),
    prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, rolloverEnabled: true },
    }),
    prisma.transaction.findMany({
      where: {
        categoryId: { in: categoryIds },
        date: { gte: startDate, lt: endDate },
        excludeFromBudget: false,
        amount: { lt: 0 },
      },
      select: { categoryId: true, amount: true, date: true },
    }),
  ]);

  const budgetLookup = new Map<string, number>();
  for (const b of budgets) budgetLookup.set(`${b.categoryId}:${b.startMonth}`, b.monthlyLimit);

  const rolloverEnabled = new Map<string, boolean>();
  for (const c of categories) rolloverEnabled.set(c.id, c.rolloverEnabled);

  const spentLookup = new Map<string, Map<string, number>>();
  for (const t of transactions) {
    if (!t.categoryId) continue;
    const ms = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    if (!spentLookup.has(t.categoryId)) spentLookup.set(t.categoryId, new Map());
    const bucket = spentLookup.get(t.categoryId)!;
    bucket.set(ms, (bucket.get(ms) ?? 0) + Math.abs(t.amount));
  }

  const result = new Map<string, number>();

  for (const catId of categoryIds) {
    if (!rolloverEnabled.get(catId)) {
      result.set(catId, budgetLookup.get(`${catId}:${currentMonthStr}`) ?? 0);
      continue;
    }

    // Iterate oldest→newest, carrying forward rollover
    let effective = budgetLookup.get(`${catId}:${monthStrings[0]!}`) ?? 0;
    for (let i = 1; i < monthStrings.length; i++) {
      const prevMs = monthStrings[i - 1]!;
      const thisMs = monthStrings[i]!;
      const thisLimit = budgetLookup.get(`${catId}:${thisMs}`) ?? 0;
      const prevSpent = spentLookup.get(catId)?.get(prevMs) ?? 0;
      effective = thisLimit + (effective - prevSpent);
    }

    result.set(catId, effective);
  }

  return result;
}

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
  const { start: monthStart, end: monthEnd } = monthBounds(month);

  const [limitConfig, closeDayConfig] = await Promise.all([
    prisma.appConfig.findUnique({ where: { key: "cc_monthly_limit" } }),
    prisma.appConfig.findUnique({ where: { key: "cc_cycle_close_day" } }),
  ]);
  const totalBudget = limitConfig ? parseFloat(limitConfig.value) : 0;
  const closeDay = closeDayConfig ? parseInt(closeDayConfig.value) : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isCurrentMonth =
    month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  // Chart always starts at the first of the selected month
  const chartStart = monthStart;

  const ccAccountIds = (await prisma.account.findMany({
    where: { type: "CREDIT_CARD", hidden: false },
    select: { id: true },
  })).map(a => a.id);

  // Per-account billing starts and ends (only meaningful for current month)
  const accountBillingStarts = new Map<string, Date>();
  const accountBillingEnds = new Map<string, Date>();

  if (!isCurrentMonth) {
    // Past/future month: constrain everything to calendar month, no cycle extension
    for (const id of ccAccountIds) {
      accountBillingStarts.set(id, monthStart);
      accountBillingEnds.set(id, monthEnd);
    }
  } else if (closeDay) {
    let billingStartDate = new Date(today.getFullYear(), today.getMonth(), closeDay);
    billingStartDate.setHours(0, 0, 0, 0);
    if (billingStartDate > today) {
      billingStartDate = new Date(today.getFullYear(), today.getMonth() - 1, closeDay);
      billingStartDate.setHours(0, 0, 0, 0);
    }
    let nextClose = new Date(today.getFullYear(), today.getMonth(), closeDay);
    nextClose.setHours(0, 0, 0, 0);
    if (nextClose <= today) {
      nextClose = new Date(today.getFullYear(), today.getMonth() + 1, closeDay);
      nextClose.setHours(0, 0, 0, 0);
    }
    for (const id of ccAccountIds) {
      accountBillingStarts.set(id, billingStartDate);
      accountBillingEnds.set(id, nextClose);
    }
  } else {
    // Heuristic: billing start = last closed bill dueDate - 7 days per account
    const recentBills = await prisma.creditCardBill.findMany({
      where: { accountId: { in: ccAccountIds } },
      orderBy: { dueDate: "desc" },
      distinct: ["accountId"],
    });
    for (const bill of recentBills) {
      const s = new Date(bill.dueDate);
      s.setDate(s.getDate() - 7);
      s.setHours(0, 0, 0, 0);
      accountBillingStarts.set(bill.accountId, s);
      const e = new Date(bill.dueDate);
      e.setDate(e.getDate() + 23);
      e.setHours(0, 0, 0, 0);
      accountBillingEnds.set(bill.accountId, e);
    }
    for (const id of ccAccountIds) {
      if (!accountBillingStarts.has(id)) accountBillingStarts.set(id, monthStart);
      if (!accountBillingEnds.has(id)) accountBillingEnds.set(id, monthEnd);
    }
  }

  // chartEnd = latest billing end; nextCloseDate = earliest billing end (for daily allowance)
  let chartEnd = monthEnd;
  let nextCloseDate = monthEnd;
  let firstEnd = true;
  for (const e of accountBillingEnds.values()) {
    if (firstEnd || e > chartEnd) chartEnd = e;
    if (firstEnd || e < nextCloseDate) nextCloseDate = e;
    firstEnd = false;
  }

  // Earliest billing start = where the orange CC line begins
  let earliestBillingStart = chartEnd;
  for (const s of accountBillingStarts.values()) {
    if (s < earliestBillingStart) earliestBillingStart = s;
  }
  if (accountBillingStarts.size === 0) earliestBillingStart = chartStart;

  const totalCCDays = Math.max(1, Math.ceil((chartEnd.getTime() - earliestBillingStart.getTime()) / (1000 * 60 * 60 * 24)));

  const txs = ccAccountIds.length > 0 ? await prisma.transaction.findMany({
    where: {
      accountId: { in: ccAccountIds },
      date: { gte: earliestBillingStart, lt: chartEnd },
      amount: { lt: 0 },
      excludeFromBudget: false,
    },
    select: { amount: true, date: true, accountId: true },
    orderBy: { date: "asc" },
  }) : [];

  const accountDayMap = new Map<string, Map<string, number>>();
  for (const id of ccAccountIds) accountDayMap.set(id, new Map());
  for (const t of txs) {
    const key = new Date(t.date).toISOString().slice(0, 10);
    const m = accountDayMap.get(t.accountId);
    if (m) m.set(key, (m.get(key) ?? 0) + Math.abs(t.amount));
  }

  const chartDays = Math.max(1, Math.ceil((chartEnd.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24)));
  const data: { day: number; label: string; ccActual: number | null; ccIdeal: number | null }[] = [];
  let ccCumulative = 0;

  for (let i = 0; i < chartDays; i++) {
    const d = new Date(chartStart);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const dateKey = d.toISOString().slice(0, 10);

    if (d <= today) {
      for (const [accountId, acctStart] of accountBillingStarts) {
        if (d >= acctStart) {
          ccCumulative += accountDayMap.get(accountId)?.get(dateKey) ?? 0;
        }
      }
    }

    const inCCRange = d >= earliestBillingStart;
    const ccDayOffset = inCCRange
      ? Math.floor((d.getTime() - earliestBillingStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
      : 0;

    data.push({
      day: i + 1,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      ccActual: inCCRange && d <= today ? ccCumulative : null,
      ccIdeal: inCCRange && totalBudget > 0 ? (totalBudget / totalCCDays) * ccDayOffset : null,
    });
  }

  const currentSpend = ccCumulative;
  const daysLeft = Math.max(1, Math.ceil((nextCloseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const daysElapsed = Math.max(1, Math.ceil((today.getTime() - earliestBillingStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const dailyAvg = currentSpend / daysElapsed;
  const projected = dailyAvg * totalCCDays;
  const remaining = Math.max(0, totalBudget - currentSpend);
  const dailyAllowance = isCurrentMonth && totalBudget > 0 && remaining > 0 ? remaining / daysLeft : 0;

  return {
    data,
    totalBudget,
    currentSpend,
    remaining,
    dailyAllowance,
    projected,
    closeDay,
    billingStart: earliestBillingStart,
    billingEnd: chartEnd,
    chartStart,
    chartEnd,
    isOverBudget: isCurrentMonth && totalBudget > 0 && currentSpend > totalBudget,
    isOverPace: isCurrentMonth && totalBudget > 0 && projected > totalBudget,
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
