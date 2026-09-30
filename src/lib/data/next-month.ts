import { prisma } from "@/lib/infra/db";
import { getInstallmentPlans } from "@/lib/data/installments";
import { getActiveRecurrings } from "@/lib/data/recurrings";
import { getBudgetsForMonth, getCategorySpendByMonth } from "@/lib/data/budgets";
import { getMonthlyCashflow } from "@/lib/data/cashflow";
import { judgeLimit, median, monthOutlook } from "@/lib/domain/next-month";
import { lastMonthKeys, monthKey } from "@/lib/domain/format";
import { addMonths } from "date-fns";

/** How many closed months say what a category "normally" costs. */
const HISTORY_MONTHS = 6;

/**
 * The month ahead: what it already owes before it starts, and which limits the history says are wrong.
 *
 * Every number comes from the module that owns it — installments, recurrings, budgets, cash flow. Nothing
 * is detected here; this only asks them about next month instead of this one.
 */
export async function getNextMonthPlan(today = new Date()) {
  const next = addMonths(today, 1);
  const key = monthKey(next);

  const [plans, recurrings, budgets, cashflow] = await Promise.all([
    getInstallmentPlans(),
    getActiveRecurrings(),
    getBudgetsForMonth(next),
    // The current month is still open, so it can't say what a month costs — read the closed ones.
    getMonthlyCashflow(HISTORY_MONTHS + 1, today),
  ]);

  // Kept as the plans themselves, not just their sum: a total nobody can open is a number to be taken
  // on faith, and every question asked of this app so far has been "where does this come from?".
  const duePlans = plans
    .map((p) => ({ key: p.key, label: p.label, account: p.accountName, amount: p.schedule.get(key) ?? 0, endMonth: p.endMonth }))
    .filter((p) => p.amount > 0);
  const installments = duePlans.reduce((s, p) => s + p.amount, 0);

  const dueNextMonth = recurrings.filter((r) => r.amount < 0 && !r.likelyInactive && monthKey(r.upcoming) === key);
  const recurringTotal = dueNextMonth.reduce((s, r) => s + Math.abs(r.amount), 0);

  const closed = cashflow.filter((m) => m.month !== monthKey(today));
  const outlook = monthOutlook(
    { installments, recurrings: recurringTotal },
    median(closed.map((m) => m.income))
  );

  const categories = await prisma.category.findMany({ where: { id: { in: [...budgets.keys()] } } });
  const history = await getCategorySpendByMonth([...budgets.keys()], lastMonthKeys(HISTORY_MONTHS + 1, today));
  const closedKeys = lastMonthKeys(HISTORY_MONTHS + 1, today).filter((k) => k !== monthKey(today));

  const limits = categories
    .map((category) => {
      const limit = budgets.get(category.id)!.limit;
      const months = closedKeys.map((k) => history.get(category.id)?.get(k) ?? 0);
      return { category, limit, ...judgeLimit(limit, months) };
    })
    // Biggest mistake first: a limit off by R$ 800 is a decision, one off by R$ 60 is noise.
    .filter((l) => l.verdict !== "ok")
    .sort((a, b) => Math.abs(b.suggested - b.limit) - Math.abs(a.suggested - a.limit));

  return { month: key, outlook, installments, duePlans, recurrings: dueNextMonth, limits };
}
