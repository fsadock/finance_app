import { addMonths } from "date-fns";
import { monthKey, monthKeyToDate } from "@/lib/domain/format";
import { normalizeMerchant } from "@/lib/domain/merchant";

export type InstallmentTx = {
  id: string;
  accountId: string;
  accountName: string;
  description: string;
  merchantName: string | null;
  amount: number;
  date: Date;
  installmentNumber: number | null;
  totalInstallments: number;
  purchaseAmount: number | null;
  purchaseDate: Date | null;
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

/**
 * Groups card installment charges ("parcelado sem juros") into purchases and projects the
 * remaining ones. Installments that should already have posted but weren't synced are treated
 * as paid, so the projection never contains past months.
 */
export function buildInstallmentPlans(txs: InstallmentTx[], today = new Date()): InstallmentPlan[] {
  const groups = new Map<string, InstallmentTx[]>();
  for (const t of txs) {
    if (t.amount >= 0 || t.totalInstallments < 2) continue;
    const cents = Math.round(Math.abs(t.amount) * 100);
    // Purchase month: Pluggy's purchaseDate, else inferred from the installment number
    const purchase = t.purchaseDate ?? addMonths(t.date, -((t.installmentNumber ?? 1) - 1));
    const merchant = normalizeMerchant(t.merchantName ?? t.description) || t.description;
    const key = [t.accountId, merchant, t.totalInstallments, monthKey(purchase), cents].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const currentMonth = monthKey(today);
  const plans: InstallmentPlan[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    const latest = list[list.length - 1]!;
    const total = latest.totalInstallments;
    const installmentAmount = Math.abs(latest.amount);
    const latestNumber = latest.installmentNumber ?? list.length;
    const latestMonth = monthKeyToDate(monthKey(latest.date));

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
