/**
 * Deciding the month that hasn't started yet.
 *
 * Looking back at what was spent is a report, and a report about money already gone changes nothing. The
 * only part of last month worth reading is what it says about the next one: how much of it is already
 * committed before anyone chooses anything, and which limits have been wrong for so long that they are
 * the thing to fix, not the spending.
 */

/** The middle month of a run — a single holiday or a broken fridge doesn't move it the way an average does. */
export function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A limit is only worth flagging when it has been wrong by a wide margin, not by a rounding error. */
const TOO_LOW = 1.25;
const TOO_HIGH = 2;
/** Below this, being "wrong" costs too little to be worth a decision. */
const WORTH_DECIDING = 50;

/**
 * What a category's limit should be, from what it actually costs month after month.
 *
 * A limit under what the months keep showing isn't a discipline problem — it's a wrong number, and it
 * turns every screen red for no reason. One far above it is just as useless: it never says stop.
 */
export function judgeLimit(limit: number, history: number[]) {
  const typical = median(history);
  const suggested = Math.max(0, Math.ceil(typical / 10) * 10);
  let verdict: "low" | "high" | "ok" = "ok";
  if (Math.abs(suggested - limit) >= WORTH_DECIDING) {
    if (typical > limit * TOO_LOW) verdict = "low";
    else if (limit > typical * TOO_HIGH) verdict = "high";
  }
  return { typical, suggested, verdict };
}

/**
 * What is already spoken for before the month starts, and what is left of a typical month's income.
 * `left` can be negative — a month that starts in the red is exactly what this is for.
 */
export function monthOutlook(committed: { installments: number; recurrings: number }, typicalIncome: number) {
  const total = committed.installments + committed.recurrings;
  return { total, typicalIncome, left: typicalIncome - total, share: typicalIncome > 0 ? total / typicalIncome : 0 };
}
