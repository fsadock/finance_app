import { prisma } from "@/lib/infra/db";
import { getConfigNumber } from "@/lib/infra/config";
import { BUDGET_RELEVANT, FLOW_SELECT, INCOME_WHERE, SPEND_WHERE, classifyFlow, spendDelta } from "@/lib/domain/flows";
import { DAY_MS, lastMonthKeys, monthBounds, monthKey, monthKeyToDate, localDayKey, startOfDay } from "@/lib/domain/format";
import { groupingKey, normalizeForGrouping } from "@/lib/domain/merchant";
import { getBudgetsForMonth } from "@/lib/data/budgets";
import { resolveBillingCycle } from "@/lib/domain/billing";
import { nextOccurrence, isLikelyInactive, priceTrend, CADENCE_TO_MONTHLY, type AutoChangeRecord, type Cadence } from "@/lib/domain/recurrence";

export async function getNetWorth() {
  const accounts = await prisma.account.findMany({ where: { hidden: false }, select: { balance: true } });
  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    if (a.balance >= 0) assets += a.balance;
    else debts += Math.abs(a.balance);
  }
  return { assets, debts, net: assets - debts };
}

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

export async function getReviewTransactions(limit = 8) {
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "REVIEW" },
      include: { account: true, category: true },
      orderBy: { date: "desc" },
      take: limit,
    }),
    prisma.transaction.count({ where: { status: "REVIEW" } }),
  ]);
  return { items, total };
}

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

export async function getMonthlyCashflow(monthsBack = 6, anchor = new Date()) {
  const keys = lastMonthKeys(monthsBack, anchor);
  const start = monthKeyToDate(keys[0]!);
  const { end } = monthBounds(anchor);
  const txs = await prisma.transaction.findMany({
    where: { AND: [{ date: { gte: start, lt: end } }, BUDGET_RELEVANT] },
    select: { ...FLOW_SELECT, date: true },
  });
  const buckets = new Map(keys.map((k) => [k, { income: 0, spend: 0 }]));
  for (const t of txs) {
    const b = buckets.get(monthKey(t.date));
    if (!b) continue;
    if (classifyFlow(t) === "income") b.income += t.amount;
    else b.spend += spendDelta(t);
  }
  return Array.from(buckets.entries()).map(([month, v]) => ({ month, ...v, net: v.income - v.spend }));
}

/** Budgets in effect for the month (carry-forward + rollover) joined with actual spend. */
export async function getMonthBudgetProgress(month = new Date()) {
  const [budgets, spend] = await Promise.all([getBudgetsForMonth(month), getCategorySpend(month)]);
  const categories = await prisma.category.findMany({ where: { id: { in: [...budgets.keys()] } } });
  return categories
    .map((category) => {
      const b = budgets.get(category.id)!;
      const spent = spend.get(category.id) ?? 0;
      return {
        category,
        limit: b.limit,
        effective: b.effective,
        spent,
        pct: b.effective > 0 ? (spent / b.effective) * 100 : 0,
      };
    })
    .filter((b) => b.limit > 0);
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

/**
 * Net worth at the end of each month. Uses daily balance snapshots when available; for months
 * before the first snapshot it reconstructs backwards from cashflow (marked `estimated`).
 */
export async function getNetWorthHistory(monthsBack = 12) {
  const keys = lastMonthKeys(monthsBack);
  const [accounts, snapshots, cashflow] = await Promise.all([
    prisma.account.findMany({ where: { hidden: false }, select: { id: true, balance: true } }),
    prisma.balanceSnapshot.findMany({
      where: { account: { hidden: false } },
      orderBy: { date: "asc" },
      select: { accountId: true, date: true, balance: true },
    }),
    getMonthlyCashflow(monthsBack),
  ]);

  const current = accounts.reduce((s, a) => s + a.balance, 0);
  const byAccount = new Map<string, { date: Date; balance: number }[]>();
  for (const s of snapshots) {
    if (!byAccount.has(s.accountId)) byAccount.set(s.accountId, []);
    byAccount.get(s.accountId)!.push(s);
  }
  const firstSnapshot = snapshots[0]?.date;

  // Backwards reconstruction from current net worth (fallback)
  const reconstructed = new Map<string, number>();
  let running = current;
  for (const m of [...cashflow].reverse()) {
    reconstructed.set(m.month, running);
    running -= m.net;
  }

  const currentKey = monthKey(new Date());
  return keys.map((key) => {
    if (key === currentKey) return { month: key, value: current, estimated: false };
    const monthEnd = monthBounds(monthKeyToDate(key)).end;
    if (!firstSnapshot || firstSnapshot >= monthEnd) {
      return { month: key, value: reconstructed.get(key) ?? current, estimated: true };
    }
    let value = 0;
    let estimated = false;
    for (const a of accounts) {
      const list = byAccount.get(a.id);
      if (!list || list.length === 0) {
        value += a.balance;
        estimated = true;
        continue;
      }
      let last: number | null = null;
      for (const s of list) {
        if (s.date >= monthEnd) break;
        last = s.balance;
      }
      if (last === null) {
        // account's history starts later — assume flat before its first snapshot
        last = list[0]!.balance;
        estimated = true;
      }
      value += last;
    }
    return { month: key, value, estimated };
  });
}

export async function getSankeyData(month = new Date()) {
  const { start, end } = monthBounds(month);
  const [txs, recurrings] = await Promise.all([
    prisma.transaction.findMany({
      where: { AND: [{ date: { gte: start, lt: end } }, BUDGET_RELEVANT] },
      select: {
        ...FLOW_SELECT,
        description: true,
        counterpartyName: true,
        recurringId: true,
        category: { select: { isIncome: true, name: true } },
      },
    }),
    prisma.recurring.findMany({ where: { active: true }, select: { pattern: true, name: true } }),
  ]);
  const recurringPatterns = new Set(recurrings.map((r) => r.pattern ?? normalizeForGrouping(r.name)).filter(Boolean));

  let income = 0;
  let fixed = 0;
  const categoriesMap = new Map<string, number>();
  for (const t of txs) {
    if (classifyFlow(t) === "income") {
      income += t.amount;
      continue;
    }
    const delta = spendDelta(t);
    const key = groupingKey(t);
    if (t.recurringId || (key && recurringPatterns.has(key))) {
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

/** Card spending pace against the monthly card goal, per-account billing cycles. */
export async function getCCSpendingData(month = new Date()) {
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const [limit, closeDay, cards] = await Promise.all([
    getConfigNumber("ccMonthlyLimit"),
    getConfigNumber("ccCycleCloseDay"),
    prisma.account.findMany({
      where: { type: "CREDIT_CARD", hidden: false },
      select: {
        id: true,
        balanceCloseDate: true,
        creditCardBills: { orderBy: { dueDate: "desc" }, take: 1, select: { dueDate: true } },
      },
    }),
  ]);
  const totalBudget = limit ?? 0;

  const today = startOfDay(new Date());
  const isCurrentMonth = monthKey(month) === monthKey(today);

  const cycles = new Map<string, { start: Date; end: Date }>();
  for (const c of cards) {
    const cycle = isCurrentMonth
      ? resolveBillingCycle({
          today,
          closeDay,
          balanceCloseDate: c.balanceCloseDate,
          lastBillDueDate: c.creditCardBills[0]?.dueDate,
        })
      : null;
    cycles.set(c.id, cycle ?? { start: monthStart, end: monthEnd });
  }

  const chartStart = monthStart;
  let chartEnd = monthEnd;
  let nextCloseDate: Date | null = null;
  let billingStart: Date | null = null;
  for (const c of cycles.values()) {
    if (c.end > chartEnd) chartEnd = c.end;
    if (!nextCloseDate || c.end < nextCloseDate) nextCloseDate = c.end;
    if (!billingStart || c.start < billingStart) billingStart = c.start;
  }
  nextCloseDate ??= monthEnd;
  billingStart ??= chartStart;

  const txs =
    cards.length > 0
      ? await prisma.transaction.findMany({
          where: {
            AND: [
              {
                accountId: { in: cards.map((c) => c.id) },
                date: { gte: billingStart < chartStart ? billingStart : chartStart, lt: chartEnd },
              },
              SPEND_WHERE,
            ],
          },
          select: { ...FLOW_SELECT, date: true, accountId: true },
        })
      : [];

  // Spend before the chart window (cycle started last month) is folded into day one.
  const byDay = new Map<string, number>();
  let carriedIn = 0;
  for (const t of txs) {
    const cycle = cycles.get(t.accountId)!;
    if (t.date < cycle.start || t.date >= cycle.end) continue;
    if (t.date < chartStart) {
      carriedIn += spendDelta(t);
      continue;
    }
    const key = localDayKey(t.date);
    byDay.set(key, (byDay.get(key) ?? 0) + spendDelta(t));
  }

  const cycleDays = Math.max(1, Math.round((chartEnd.getTime() - billingStart.getTime()) / DAY_MS));
  const chartDays = Math.max(1, Math.round((chartEnd.getTime() - chartStart.getTime()) / DAY_MS));
  const data: { day: number; label: string; ccActual: number | null; ccIdeal: number | null }[] = [];
  let cumulative = carriedIn;
  for (let i = 0; i < chartDays; i++) {
    const d = new Date(chartStart.getFullYear(), chartStart.getMonth(), chartStart.getDate() + i);
    const inCycle = d >= billingStart;
    if (inCycle && d <= today) cumulative += byDay.get(localDayKey(d)) ?? 0;
    const offset = Math.round((d.getTime() - billingStart.getTime()) / DAY_MS) + 1;
    data.push({
      day: i + 1,
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      ccActual: inCycle && d <= today ? cumulative : null,
      ccIdeal: inCycle && totalBudget > 0 ? (totalBudget / cycleDays) * offset : null,
    });
  }

  const currentSpend = isCurrentMonth ? cumulative : [...byDay.values()].reduce((s, v) => s + v, carriedIn);
  const daysLeft = Math.max(1, Math.ceil((nextCloseDate.getTime() - today.getTime()) / DAY_MS));
  const daysElapsed = Math.max(1, Math.round((today.getTime() - billingStart.getTime()) / DAY_MS) + 1);
  const projected = (currentSpend / daysElapsed) * cycleDays;
  const remaining = Math.max(0, totalBudget - currentSpend);

  return {
    data,
    totalBudget,
    currentSpend,
    remaining,
    dailyAllowance: isCurrentMonth && totalBudget > 0 && remaining > 0 ? remaining / daysLeft : 0,
    projected,
    closeDay,
    billingStart,
    billingEnd: chartEnd,
    chartStart,
    chartEnd,
    isOverBudget: totalBudget > 0 && currentSpend > totalBudget,
    isOverPace: isCurrentMonth && totalBudget > 0 && projected > totalBudget,
  };
}

type RebalanceSuggestion = { fromId: string; fromName: string; toId: string; toName: string; amount: number };

export async function getRebalanceSuggestions(month = new Date()): Promise<RebalanceSuggestion[]> {
  const budgets = await getMonthBudgetProgress(month);
  const surplus = budgets
    .filter((b) => b.spent < b.limit)
    .map((b) => ({ id: b.category.id, name: b.category.name, available: b.limit - b.spent }))
    .sort((a, b) => b.available - a.available);
  const deficits = budgets
    .filter((b) => b.spent > b.limit)
    .map((b) => ({ id: b.category.id, name: b.category.name, needed: b.spent - b.limit }))
    .sort((a, b) => b.needed - a.needed);

  const suggestions: RebalanceSuggestion[] = [];
  let s = 0;
  let d = 0;
  while (s < surplus.length && d < deficits.length) {
    const from = surplus[s]!;
    const to = deficits[d]!;
    const move = Math.min(from.available, to.needed);
    if (move > 1) {
      suggestions.push({ fromId: from.id, fromName: from.name, toId: to.id, toName: to.name, amount: Math.round(move * 100) / 100 });
    }
    from.available -= move;
    to.needed -= move;
    if (from.available <= 0) s++;
    if (to.needed <= 0) d++;
  }
  return suggestions;
}

export async function getLastSync() {
  const item = await prisma.pluggyItem.findFirst({
    where: { lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });
  return item?.lastSyncedAt ?? null;
}
