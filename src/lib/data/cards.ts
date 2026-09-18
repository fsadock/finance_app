import { prisma } from "@/lib/infra/db";
import { getConfigNumber } from "@/lib/infra/config";
import { resolveBillingCycle } from "@/lib/domain/billing";
import { FLOW_SELECT, SPEND_WHERE, spendDelta } from "@/lib/domain/flows";
import { DAY_MS, localDayKey, monthBounds, monthKey, startOfDay } from "@/lib/domain/format";

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

type CardForBill = {
  id: string;
  type: string;
  balanceCloseDate: Date | null;
  creditCardBills: { dueDate: Date }[];
};

/** Open fatura per card: net spend inside the card's current billing cycle. */
export async function getOpenBills(accounts: CardForBill[], closeDay: number | null, today: Date) {
  const openBill = new Map<string, { total: number; start: Date; end: Date }>();
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const cycles = cards
    .map((a) => ({
      id: a.id,
      cycle: resolveBillingCycle({
        today,
        closeDay,
        balanceCloseDate: a.balanceCloseDate,
        lastBillDueDate: a.creditCardBills[0]?.dueDate,
      }),
    }))
    .filter((c): c is { id: string; cycle: NonNullable<typeof c.cycle> } => c.cycle !== null);
  if (cycles.length > 0) {
    const earliest = cycles.reduce((min, c) => (c.cycle.start < min ? c.cycle.start : min), cycles[0]!.cycle.start);
    const txs = await prisma.transaction.findMany({
      where: { AND: [{ accountId: { in: cycles.map((c) => c.id) }, date: { gte: earliest } }, SPEND_WHERE] },
      select: { ...FLOW_SELECT, accountId: true, date: true },
    });
    for (const { id, cycle } of cycles) {
      const total = txs
        .filter((t) => t.accountId === id && t.date >= cycle.start && t.date < cycle.end)
        .reduce((s, t) => s + spendDelta(t), 0);
      openBill.set(id, { total, ...cycle });
    }
  }
  return openBill;
}

