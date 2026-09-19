import { addDays, addMonths } from "date-fns";
import { startOfDay } from "@/lib/domain/format";

type BillingCycle = { start: Date; end: Date; source: "closeDay" | "pluggy" | "lastBill" };

/** Cycle [start, end) containing `today`, for a card that closes on the same day-of-month as `anchorClose`. */
export function cycleContaining(anchorClose: Date, today: Date): { start: Date; end: Date } {
  const t = startOfDay(today);
  const anchor = startOfDay(anchorClose);
  let n = 0;
  while (addMonths(anchor, n) <= t) n++;
  while (addMonths(anchor, n - 1) > t) n--;
  return { start: addMonths(anchor, n - 1), end: addMonths(anchor, n) };
}

/**
 * Resolves the open credit card billing cycle. Priority:
 *  1. user-configured close day (AppConfig `cc_cycle_close_day`)
 *  2. Pluggy's `balanceCloseDate` for the account
 *  3. heuristic from the last closed bill (close ≈ due date − 7 days)
 */
export function resolveBillingCycle(opts: {
  today: Date;
  closeDay?: number | null;
  balanceCloseDate?: Date | null;
  lastBillDueDate?: Date | null;
}): BillingCycle | null {
  const { today, closeDay, balanceCloseDate, lastBillDueDate } = opts;
  if (closeDay) {
    return { ...cycleContaining(new Date(today.getFullYear(), today.getMonth(), closeDay), today), source: "closeDay" };
  }
  if (balanceCloseDate) {
    return { ...cycleContaining(balanceCloseDate, today), source: "pluggy" };
  }
  if (lastBillDueDate) {
    return { ...cycleContaining(addDays(lastBillDueDate, -7), today), source: "lastBill" };
  }
  return null;
}

/** Banks set the due date about a week after the bill closes (same rule as the last-bill heuristic). */
export const dueAfterClose = (close: Date) => addDays(close, 7);

/**
 * The bill that closed when the current cycle started, if the bank hasn't sent it yet: the last known
 * bill closed well before that. Returns its close and (estimated) due dates, or null.
 */
export function missingClosedBill(lastBillDueDate: Date | null | undefined, currentCycleStart: Date) {
  if (!lastBillDueDate) return null;
  const lastClose = addDays(startOfDay(lastBillDueDate), -7);
  if (currentCycleStart <= addDays(lastClose, 10)) return null;
  return { closedOn: currentCycleStart, dueOn: dueAfterClose(currentCycleStart) };
}

