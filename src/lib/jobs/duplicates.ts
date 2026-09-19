import { prisma } from "@/lib/infra/db";
import { dateOnlyDuplicates } from "@/lib/domain/duplicates";

/**
 * Deletes date-only copies of transactions that also exist with their real time (see
 * dateOnlyDuplicates). Copies the user touched (notes, tags) or that pair a transfer are kept.
 */
export async function removeDuplicateTransactions() {
  const txs = await prisma.transaction.findMany({
    select: { id: true, accountId: true, date: true, amount: true, description: true, notes: true, transferPairId: true, _count: { select: { tags: true } } },
  });
  const ids = dateOnlyDuplicates(txs)
    .filter((t) => !t.notes && !t.transferPairId && t._count.tags === 0)
    .map((t) => t.id);
  if (ids.length > 0) await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
  return { removed: ids.length };
}
