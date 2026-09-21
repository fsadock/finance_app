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
 * Groups card installment charges ("parcelado sem juros") into purchases and projects the
 * remaining ones. Installments that should already have posted but weren't synced are treated
 * as paid, so the projection never contains past months.
 */
export function buildInstallmentPlans(txs: InstallmentTx[], today = new Date()): InstallmentPlan[] {
  const charges = txs.filter((t) => t.amount < 0 && t.totalInstallments >= 2);
  const groups = groupInstallmentPurchases(charges).map((list) => {
    const anchor = purchaseAnchor(list) ?? addMonths(list[0]!.date, -((list[0]!.installmentNumber ?? 1) - 1));
    return [[list[0]!.accountId, merchantOf(list[0]!), list[0]!.totalInstallments, monthKey(anchor)].join("|"), list] as const;
  });

  const currentMonth = monthKey(today);
  const plans: InstallmentPlan[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    // Reference: the newest installment already charged. Banks also send the future ones up front,
    // and taking the last of those would mark the whole purchase as paid.
    const charged = list.filter((t) => t.date <= today);
    const latest = charged.length > 0 ? charged[charged.length - 1]! : list[0]!;
    const total = latest.totalInstallments;
    const installmentAmount = Math.abs(latest.amount);
    const latestNumber = charged.length > 0 ? (latest.installmentNumber ?? charged.length) : (latest.installmentNumber ?? 1) - 1;
    const latestMonth = monthKeyToDate(monthKey(charged.length > 0 ? latest.date : addMonths(latest.date, -1)));

    const schedule = new Map<string, number>();
    let paid = latestNumber;
    for (let k = 1; k <= total - latestNumber; k++) {
      const month = monthKey(addMonths(latestMonth, k));
      if (month < currentMonth) paid++;
      else schedule.set(month, installmentAmount);
    }
    const remaining = total - paid;
    if (remaining <= 0) continue;

    const purchaseMonth = monthKey(addMonths(latestMonth, -(latestNumber - 1)));
    plans.push({
      key,
      label: latest.merchantName ?? latest.description.replace(/\s*(parc(ela)?\.?\s*)?\d{1,2}\s*(\/|de)\s*\d{1,2}\s*/i, " ").trim(),
      accountName: latest.accountName,
      installmentAmount,
      total: latest.purchaseAmount ?? installmentAmount * total,
      totalInstallments: total,
      paid,
      remaining,
      remainingAmount: remaining * installmentAmount,
      purchaseMonth,
      endMonth: monthKey(addMonths(latestMonth, total - latestNumber)),
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
