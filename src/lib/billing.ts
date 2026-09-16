import { addDays, addMonths } from "date-fns";
import { startOfDay } from "./format";

export type BillingCycle = { start: Date; end: Date; source: "closeDay" | "pluggy" | "lastBill" };

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
