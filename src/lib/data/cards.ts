import { prisma } from "@/lib/infra/db";
import { getConfigNumber } from "@/lib/infra/config";
import { dueAfterClose, missingClosedBill, resolveBillingCycle } from "@/lib/domain/billing";
import { addDays } from "date-fns";
import { FLOW_SELECT, SPEND_WHERE, spendDelta } from "@/lib/domain/flows";
import { DAY_MS, monthBounds, monthKey, startOfDay } from "@/lib/domain/format";
import { cumulativeSeries, sumByDay } from "@/lib/domain/series";

/** Card spending pace against the monthly card goal, per-account billing cycles. */
export async function getCCSpendingData(month = new Date()) {
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const [limit, closeDay, cards] = await Promise.all([getConfigNumber("ccMonthlyLimit"), getConfigNumber("ccCycleCloseDay"), getCards()]);
  const totalBudget = limit ?? 0;

  const today = startOfDay(new Date());
  const isCurrentMonth = monthKey(month) === monthKey(today);

  // Past months use the calendar month for every card.
  const current = isCurrentMonth ? currentCycles(cards, closeDay, today) : null;
  const cycles = new Map(cards.map((c) => [c.id, current?.get(c.id) ?? { start: monthStart, end: monthEnd }]));

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
  const inCycle = txs.filter((t) => {
    const cycle = cycles.get(t.accountId)!;
    return t.date >= cycle.start && t.date < cycle.end;
  });
  const carriedIn = inCycle.filter((t) => t.date < chartStart).reduce((s, t) => s + spendDelta(t), 0);
  const byDay = sumByDay(inCycle.filter((t) => t.date >= chartStart), spendDelta);

  const cycleDays = Math.max(1, Math.round((chartEnd.getTime() - billingStart.getTime()) / DAY_MS));
  const chartDays = Math.max(1, Math.round((chartEnd.getTime() - chartStart.getTime()) / DAY_MS));
  const cycleStart = billingStart;
  const { points, total: cumulative } = cumulativeSeries({
    from: chartStart,
    days: chartDays,
    today,
    byDay,
    initial: carriedIn,
    counts: (d) => d >= cycleStart,
    ideal: (d) =>
      d >= cycleStart && totalBudget > 0
        ? (totalBudget / cycleDays) * (Math.round((d.getTime() - cycleStart.getTime()) / DAY_MS) + 1)
        : null,
  });
  const data = points.map(({ actual, ideal, ...p }) => ({ ...p, ccActual: actual, ccIdeal: ideal }));

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

type CardCycleInput = { id: string; balanceCloseDate: Date | null; creditCardBills: { dueDate: Date }[] };

/** Each card's current billing cycle; null when it can't be determined yet. */
function currentCycles(cards: CardCycleInput[], closeDay: number | null, today: Date) {
  return new Map(
    cards.map((c) => [
      c.id,
      resolveBillingCycle({
        today,
        closeDay,
        balanceCloseDate: c.balanceCloseDate,
        lastBillDueDate: c.creditCardBills[0]?.dueDate,
      }),
    ])
  );
}

type CardForBill = {
  id: string;
  type: string;
  balance: number;
  balanceCloseDate: Date | null;
  creditCardBills: { dueDate: Date }[];
};

type OpenBill = {
  /** Estimate: net spend dated inside the current cycle (the bank may place installments differently). */
  total: number;
  start: Date;
  end: Date;
  dueOn: Date;
  /** A bill that already closed but the bank hasn't sent yet. */
  missing: { closedOn: Date; dueOn: Date } | null;
  /** What the card owes now, closed + current bills: the balance minus installments dated in the future. */
  outstanding: number;
};

/** Current fatura per card, plus any closed bill Pluggy hasn't delivered yet. */
export async function getOpenBills(accounts: CardForBill[], closeDay: number | null, today: Date) {
  const openBill = new Map<string, OpenBill>();
  const cards = accounts.filter((a) => a.type === "CREDIT_CARD");
  const cycles = [...currentCycles(cards, closeDay, today)].flatMap(([id, cycle]) => (cycle ? [{ id, cycle }] : []));
  if (cycles.length > 0) {
    const earliest = cycles.reduce((min, c) => (c.cycle.start < min ? c.cycle.start : min), cycles[0]!.cycle.start);
    const txs = await prisma.transaction.findMany({
      where: { AND: [{ accountId: { in: cycles.map((c) => c.id) }, date: { gte: earliest } }, SPEND_WHERE] },
      select: { ...FLOW_SELECT, accountId: true, date: true },
    });
    const future = await prisma.transaction.groupBy({
      by: ["accountId"],
      where: { accountId: { in: cycles.map((c) => c.id) }, date: { gte: addDays(startOfDay(today), 1) } },
      _sum: { amount: true },
    });
    for (const { id, cycle } of cycles) {
      const card = cards.find((c) => c.id === id)!;
      const total = txs
        .filter((t) => t.accountId === id && t.date >= cycle.start && t.date < cycle.end)
        .reduce((s, t) => s + spendDelta(t), 0);
      const futureCharges = -(future.find((f) => f.accountId === id)?._sum.amount ?? 0);
      openBill.set(id, {
        total,
        start: cycle.start,
        end: cycle.end,
        dueOn: dueAfterClose(cycle.end),
        missing: missingClosedBill(card.creditCardBills[0]?.dueDate, cycle.start),
        outstanding: Math.max(0, -card.balance - futureCharges),
      });
    }
  }
  return openBill;
}

function getCards() {
  return prisma.account.findMany({
    where: { type: "CREDIT_CARD", hidden: false },
    select: {
      id: true,
      balanceCloseDate: true,
      creditCardBills: { orderBy: { dueDate: "desc" }, take: 1, select: { dueDate: true } },
    },
  });
}

/** When each card's open bill started: charges before it are in bills that already closed. */
export async function getOpenBillStarts(today = startOfDay(new Date())) {
  const [closeDay, cards] = await Promise.all([getConfigNumber("ccCycleCloseDay"), getCards()]);
  const starts = new Map<string, Date>();
  for (const [id, cycle] of currentCycles(cards, closeDay, today)) if (cycle) starts.set(id, cycle.start);
  return starts;
}

