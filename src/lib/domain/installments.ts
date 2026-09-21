import { addMonths } from "date-fns";
import { DAY_MS, monthKey, monthKeyToDate } from "@/lib/domain/format";
import { normalizeMerchant } from "@/lib/domain/merchant";

export type InstallmentTx = InstallmentRow & {
  accountName: string;
  totalInstallments: number;
  purchaseAmount: number | null;
};

type InstallmentPlan = {
  key: string;
  label: string;
  accountName: string;
  installmentAmount: number;
  total: number;
  totalInstallments: number;
  paid: number;
  remaining: number;
  remainingAmount: number;
  purchaseMonth: string;
  endMonth: string;
  /** month key → amount still to be charged */
  schedule: Map<string, number>;
};

/** What grouping needs from an installment charge. */
export type InstallmentRow = {
  id: string;
  accountId: string;
  description: string;
  merchantName: string | null;
  amount: number;
  date: Date;
  installmentNumber: number | null;
  totalInstallments: number | null;
  purchaseDate: Date | null;
};

const merchantOf = (r: InstallmentRow) => normalizeMerchant(r.merchantName ?? r.description) || r.description;
const cents = (amount: number) => Math.round(Math.abs(amount) * 100);
/** Brazilian cards put the rounding in the first installment (1/5 = 77,32, the rest 77,29). */
const sameInstallmentValue = (a: number, b: number) => Math.abs(Math.abs(a) - Math.abs(b)) <= Math.max(0.05, Math.abs(a) * 0.01);
const uniqueNumbers = (rows: InstallmentRow[]) => new Set(rows.map((r) => r.installmentNumber)).size === rows.length;

function groupBy<T>(rows: T[], key: (r: T) => string) {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r]);
  return [...out.values()];
}

/**
 * Groups installment charges into purchases: same card, merchant and number of installments, with
 * values equal up to the first installment's rounding. When installment numbers repeat (two similar
 * purchases), values must match to the cent, and then the purchase month (from the installment number)
 * separates what's left.
 */
export function groupInstallmentPurchases<T extends InstallmentRow>(rows: T[]): T[][] {
  const out: T[][] = [];
  const valid = rows.filter((r) => r.installmentNumber && r.totalInstallments && r.totalInstallments > 1);
  for (const bucket of groupBy(valid, (r) => [r.accountId, merchantOf(r), r.totalInstallments].join("|"))) {
    if (uniqueNumbers(bucket) && bucket.every((r) => sameInstallmentValue(r.amount, bucket[0]!.amount))) {
      out.push(bucket);
      continue;
    }
    for (const sameValue of groupBy(bucket, (r) => String(cents(r.amount)))) {
      if (uniqueNumbers(sameValue)) out.push(sameValue);
      else out.push(...groupBy(sameValue, (r) => monthKey(addMonths(r.date, -(r.installmentNumber! - 1)))));
    }
  }
  return out;
}

/**
 * When the purchase was made, or null when it can't be told:
 * 1. installment 1's date, when present (then installment 1 never moves);
 * 2. several installments stamped with the same purchase date: that date;
 * 3. several with different purchase dates (each installment's own date): date − (n − 1) months;
 * 4. a single purchase date and no installment 1 is ambiguous (purchase or its own date?).
 */
function purchaseAnchor(group: InstallmentRow[]): Date | null {
  const first = group.find((r) => r.installmentNumber === 1);
  if (first) return first.date;
  const withPurchase = group.filter((r) => r.purchaseDate);
  if (withPurchase.length < 2) return null;
  const times = withPurchase.map((r) => r.purchaseDate!.getTime());
  if (Math.max(...times) - Math.min(...times) <= 20 * DAY_MS) return new Date(Math.min(...times));
  return new Date(Math.min(...withPurchase.map((r) => addMonths(r.purchaseDate!, -(r.installmentNumber! - 1)).getTime())));
}

/**
 * When each installment of a purchase is charged, read from the bank's data without changing it.
 * Some banks (BTG) date future installments with the purchase date: 7/10 dated on the purchase day
 * is charged six months later. An installment n > 1 dated on the purchase day (±2 days) is read as
 * purchase + (n − 1) months; every other date is the bank's — including a second installment posted a
 * week later on the closing day (Nubank), which is a real bill posting.
 */
function chargeDates(group: InstallmentRow[]): Map<number, Date> {
  const anchor = purchaseAnchor(group);
  const out = new Map<number, Date>();
  for (const r of group) {
    const n = r.installmentNumber!;
    const stampedWithPurchase = anchor !== null && n > 1 && Math.abs(r.date.getTime() - anchor.getTime()) <= 2 * DAY_MS;
    out.set(n, stampedWithPurchase ? addMonths(anchor, n - 1) : r.date);
  }
  return out;
}

/**
 * Groups card installment charges ("parcelado") into purchases and projects what's left, the way the
 * bank counts it: an installment is settled once its bill has closed (charged before the card's open
 * bill started); the one in the open bill and the ones after are still to pay. Installments the bank
 * hasn't sent yet are placed from the installment numbers of the ones it did.
 * `openBillStarts`: per card; cards without one fall back to the start of the current month.
 */
export function buildInstallmentPlans(
  txs: InstallmentTx[],
  { today = new Date(), openBillStarts = new Map<string, Date>() }: { today?: Date; openBillStarts?: Map<string, Date> } = {}
): InstallmentPlan[] {
  const charges = txs.filter((t) => t.amount < 0 && t.totalInstallments >= 2);
  const plans: InstallmentPlan[] = [];
  for (const list of groupInstallmentPurchases(charges)) {
    const known = new Map(list.map((t) => [t.installmentNumber!, t]));
    const charged = chargeDates(list);
    const numbers = [...known.keys()].sort((a, b) => a - b);
    const total = list[0]!.totalInstallments;
    // Date of installment k: when it's charged, or projected from the nearest one the bank sent.
    const dateOf = (k: number) => {
      if (charged.has(k)) return charged.get(k)!;
      const nearest = numbers.reduce((best, n) => (Math.abs(n - k) < Math.abs(best - k) ? n : best));
      return addMonths(charged.get(nearest)!, k - nearest);
    };
    const settledBefore = openBillStarts.get(list[0]!.accountId) ?? new Date(today.getFullYear(), today.getMonth(), 1);

    const reference = known.get(numbers[numbers.length - 1]!)!; // later installments don't carry the rounding
    const installmentAmount = Math.abs(reference.amount);
    const schedule = new Map<string, number>();
    let paid = 0;
    for (let k = 1; k <= total; k++) {
      const date = dateOf(k);
      if (date < settledBefore) paid++;
      else schedule.set(monthKey(date), (schedule.get(monthKey(date)) ?? 0) + installmentAmount);
    }
    const remaining = total - paid;
    if (remaining <= 0) continue;

    const purchase = purchaseAnchor(list) ?? dateOf(1);
    plans.push({
      key: [reference.accountId, merchantOf(reference), total, monthKey(purchase)].join("|"),
      label: reference.merchantName ?? reference.description.replace(/\s*(parc(ela)?\.?\s*)?\d{1,2}\s*(\/|de)\s*\d{1,2}\s*/i, " ").trim(),
      accountName: reference.accountName,
      installmentAmount,
      total: reference.purchaseAmount ?? installmentAmount * total,
      totalInstallments: total,
      paid,
      remaining,
      remainingAmount: remaining * installmentAmount,
      purchaseMonth: monthKey(purchase),
      endMonth: monthKey(dateOf(total)),
      schedule,
    });
  }
  return plans.sort((a, b) => b.remainingAmount - a.remainingAmount);
}

/** Total already committed to each of the next `months` months (current month first). */
export function committedByMonth(plans: InstallmentPlan[], months = 12, today = new Date()) {
  const start = monthKeyToDate(monthKey(today));
  return Array.from({ length: months }, (_, i) => {
    const month = monthKey(addMonths(start, i));
    return { month, total: plans.reduce((s, p) => s + (p.schedule.get(month) ?? 0), 0) };
  });
}
