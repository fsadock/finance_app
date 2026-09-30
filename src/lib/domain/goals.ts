import { differenceInCalendarDays, differenceInCalendarMonths } from "date-fns";

/** A goal follows either one account, every account of a kind, or a number typed by hand. */
export const ACCOUNT_GROUP_LABEL: Record<string, string> = {
  CHECKING: "Todas as contas correntes",
  SAVINGS: "Todas as poupanças",
  INVESTMENT: "Todos os investimentos",
  CASH: "Todo o dinheiro em espécie",
  LOAN: "Todos os empréstimos",
};

type GoalInput = {
  targetAmount: number;
  currentAmount: number;
  deadline: Date | null;
  /** The accounts the goal follows; null when it tracks a hand-typed amount. */
  accounts: { balance: number }[] | null;
};

/**
 * How far a goal is: saved (the balance of what it follows), what's left and what to save per month.
 *
 * A goal follows a set of accounts, not a single one — "investimentos" is spread over the broker and one
 * account per crypto wallet, and a new wallet has to count without anyone editing the goal.
 */
export function goalProgress<G extends GoalInput>(g: G, today: Date) {
  const saved = g.accounts ? Math.max(0, g.accounts.reduce((s, a) => s + a.balance, 0)) : g.currentAmount;
  const remaining = Math.max(0, g.targetAmount - saved);
  const daysLeft = g.deadline ? differenceInCalendarDays(g.deadline, today) : null;
  const monthsLeft = g.deadline ? Math.max(1, differenceInCalendarMonths(g.deadline, today)) : null;
  return {
    goal: g,
    saved,
    remaining,
    pct: g.targetAmount > 0 ? Math.min(100, (saved / g.targetAmount) * 100) : 0,
    daysLeft,
    monthlyNeeded: daysLeft !== null && daysLeft > 0 && remaining > 0 ? remaining / monthsLeft! : null,
  };
}
