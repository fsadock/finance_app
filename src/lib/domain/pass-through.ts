import { DAY_MS } from "./format";
import { groupingKey, isUnnamedBillPayment } from "./merchant";

/**
 * Money that only passes through the account: a bill someone else sends you the money for, a purchase a friend
 * pays you back for. It leaves and enters the account, so it belongs in the statement, but it is not spending
 * and must not weigh on budgets. The owner marks one; these rules recognize the next ones.
 */
export type PassThroughTx = {
  id: string;
  accountId: string;
  description: string;
  merchantRaw?: string | null;
  counterpartyName?: string | null;
  amount: number;
  chargeDate: Date;
  excludeOverride: boolean | null;
};

/** The two sides differ by at most R$ 5 or 1%, whichever is larger: fees and rounding shouldn't break the pair. */
export function amountsCancel(a: number, b: number) {
  return Math.abs(a + b) <= Math.max(5, Math.abs(a) * 0.01);
}

const PAIR_WINDOW_DAYS = 5;

/** The transaction on the other side of a pass-through: same account, opposite sign, same amount, days apart. */
export function findCounterpart<T extends PassThroughTx>(tx: T, candidates: T[]): T | null {
  const near = candidates.filter(
    (c) =>
      c.id !== tx.id &&
      c.accountId === tx.accountId &&
      Math.sign(c.amount) !== Math.sign(tx.amount) &&
      amountsCancel(tx.amount, c.amount) &&
      Math.abs(c.chargeDate.getTime() - tx.chargeDate.getTime()) <= PAIR_WINDOW_DAYS * DAY_MS
  );
  if (near.length === 0) return null;
  // the closest in time, so a month with two similar pairs doesn't cross them
  return near.reduce((best, c) =>
    Math.abs(c.chargeDate.getTime() - tx.chargeDate.getTime()) < Math.abs(best.chargeDate.getTime() - tx.chargeDate.getTime()) ? c : best
  );
}

/**
 * What makes two charges "the same bill" in different months: the account and the description. Banks send bill
 * payments with no payee ("Bankslip"), so those share one key and are told apart by amount and day of month.
 *
 * Only outflows get a key: the money that funds a pass-through is usually a bare "Pix", which would match any
 * other Pix. That side is recognized as the counterpart of the bill instead.
 */
function billKey(tx: PassThroughTx) {
  if (tx.amount >= 0) return null;
  const key = groupingKey(tx);
  if (key) return `${tx.accountId}|${key}`;
  // "Pix" tells us nothing, but a payment the bank sends without the payee's name is still a bill
  return isUnnamedBillPayment(tx) ? `${tx.accountId}|boleto-sem-nome` : null;
}

/** Monthly bills land around the same day; 31 → 1 is one day apart, not thirty. */
function sameTimeOfMonth(a: Date, b: Date) {
  const diff = Math.abs(a.getDate() - b.getDate());
  return Math.min(diff, 31 - diff) <= 5;
}

/**
 * The ones to mark automatically: a transaction that repeats a bill the owner already marked as a pass-through
 * (same account, same description, same amount within tolerance), plus whatever funds it.
 */
export function newPassThroughs<T extends PassThroughTx>(txs: T[]): T[] {
  const marked = txs.filter((t) => t.excludeOverride === true);
  if (marked.length === 0) return [];

  const byBill = new Map<string, T[]>();
  for (const t of marked) {
    const key = billKey(t);
    if (!key) continue;
    if (!byBill.has(key)) byBill.set(key, []);
    byBill.get(key)!.push(t);
  }

  const found = new Map<string, T>();
  for (const t of txs) {
    if (t.excludeOverride !== null) continue;
    const key = billKey(t);
    const examples = key ? byBill.get(key) : undefined;
    // a marked example of the same bill, in another month, for about the same amount and around the same day
    const repeats = examples?.some(
      (e) =>
        amountsCancel(t.amount, -e.amount) &&
        e.chargeDate.getTime() !== t.chargeDate.getTime() &&
        sameTimeOfMonth(t.chargeDate, e.chargeDate)
    );
    if (!repeats) continue;
    found.set(t.id, t);
    const counterpart = findCounterpart(t, txs);
    if (counterpart && counterpart.excludeOverride === null) found.set(counterpart.id, counterpart);
  }
  return [...found.values()];
}
