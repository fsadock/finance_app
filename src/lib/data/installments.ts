import { prisma } from "@/lib/infra/db";
import { buildInstallmentPlans } from "@/lib/domain/installments";
import { getOpenBillStarts } from "@/lib/data/cards";

/** Card purchases in installments ("parcelado") from the last 4 years, grouped into plans. */
export async function getInstallmentPlans() {
  const since = new Date();
  since.setMonth(since.getMonth() - 48);
  const [txs, openBillStarts] = await Promise.all([
    prisma.transaction.findMany({
    where: {
      totalInstallments: { gt: 1 },
      amount: { lt: 0 },
      date: { gte: since },
      account: { type: "CREDIT_CARD", hidden: false },
    },
    select: {
      id: true,
      accountId: true,
      description: true,
      merchantName: true,
      amount: true,
      date: true,
      installmentNumber: true,
      totalInstallments: true,
      purchaseAmount: true,
      purchaseDate: true,
      account: { select: { name: true } },
    },
    }),
    getOpenBillStarts(),
  ]);

  return buildInstallmentPlans(
    txs.map((t) => ({ ...t, accountName: t.account.name, totalInstallments: t.totalInstallments! })),
    { openBillStarts }
  );
}
