import { prisma } from "@/lib/infra/db";
import { installmentChargeDates } from "@/lib/domain/installments";

/**
 * Keeps `chargeDate` — the day a transaction hits its account or card bill — in step with the bank's
 * `date`: equal to it, except installments dated with the purchase day (see installmentChargeDates).
 * Only writes rows whose value changes; the bank's `date` is never modified.
 */
export async function updateChargeDates() {
  const rows = await prisma.transaction.findMany({
    select: {
      id: true,
      accountId: true,
      description: true,
      merchantName: true,
      amount: true,
      date: true,
      chargeDate: true,
      installmentNumber: true,
      totalInstallments: true,
      purchaseDate: true,
    },
  });
  const installments = installmentChargeDates(rows.filter((r) => r.totalInstallments && r.totalInstallments > 1));
  const updates = rows.flatMap((r) => {
    const chargeDate = installments.get(r.id) ?? r.date;
    return chargeDate.getTime() === r.chargeDate.getTime()
      ? []
      : [prisma.transaction.update({ where: { id: r.id }, data: { chargeDate } })];
  });
  if (updates.length > 0) await prisma.$transaction(updates);
  return { updated: updates.length };
}
