import { prisma } from "@/lib/infra/db";
import { deterministicCategory, planInstallmentRedates } from "@/lib/domain/brazil";

/**
 * Backfill for the no-AI rules: categorizes REVIEW transactions that match a deterministic rule
 * (own-account Pix, card bill payments, investment moves, balance yield) and re-dates installments
 * that the connector stamped with the purchase date. Idempotent; never touches user-categorized rows.
 */
export async function applyDeterministicRules() {
  const categories = await prisma.category.findMany({
    where: { name: { in: ["Transferências", "Pagamento de fatura", "Investimentos", "Rendimentos"] } },
    select: { id: true, name: true, excludeFromBudget: true },
  });
  const byName = new Map(categories.map((c) => [c.name, c]));

  const review = await prisma.transaction.findMany({
    where: { status: "REVIEW" },
    select: {
      id: true,
      description: true,
      amount: true,
      counterpartyType: true,
      paymentMethod: true,
      account: { select: { type: true } },
    },
  });
  const updates = [];
  for (const t of review) {
    const name = deterministicCategory({ ...t, accountType: t.account.type });
    const cat = name ? byName.get(name) : undefined;
    if (!cat) continue;
    updates.push(
      prisma.transaction.update({
        where: { id: t.id },
        data: { categoryId: cat.id, status: "POSTED", excludeFromBudget: cat.excludeFromBudget },
      })
    );
  }

  const installments = await prisma.transaction.findMany({
    where: { totalInstallments: { gt: 1 }, installmentNumber: { not: null } },
    select: {
      id: true,
      accountId: true,
      description: true,
      merchantName: true,
      amount: true,
      date: true,
      installmentNumber: true,
      totalInstallments: true,
      purchaseDate: true,
    },
  });
  const redates = planInstallmentRedates(installments);
  const redated = redates.length;
  for (const r of redates) updates.push(prisma.transaction.update({ where: { id: r.id }, data: { date: r.date } }));

  if (updates.length > 0) await prisma.$transaction(updates);
  return { categorized: updates.length - redated, redated };
}
