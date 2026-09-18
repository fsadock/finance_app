import { differenceInCalendarDays, differenceInCalendarMonths } from "date-fns";

type GoalInput = { targetAmount: number; currentAmount: number; deadline: Date | null; account: { balance: number } | null };

/** How far a goal is: saved (the account balance when linked), what's left and what to save per month. */
export function goalProgress<G extends GoalInput>(g: G, today: Date) {
  // linked goals follow the account balance
  const saved = g.account ? Math.max(0, g.account.balance) : g.currentAmount;
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
