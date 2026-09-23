import { prisma } from "@/lib/infra/db";
import { deterministicCategory } from "@/lib/domain/brazil";

/**
 * Backfill for the no-AI rules: categorizes REVIEW transactions that match a deterministic rule
 * (own-account Pix, card bill payments, investment moves, balance yield). Idempotent; never touches
 * user-categorized rows.
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
      excludeOverride: true,
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
        data: { categoryId: cat.id, status: "POSTED", excludeFromBudget: t.excludeOverride ?? cat.excludeFromBudget },
      })
    );
  }

  if (updates.length > 0) await prisma.$transaction(updates);
  return { categorized: updates.length };
}
