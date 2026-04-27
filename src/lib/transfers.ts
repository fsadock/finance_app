import { prisma } from "./db";

const PAIR_DAY_WINDOW = 3;

function genPairId() {
  return `pair_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function detectTransfers(daysBack = 60) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  // Pull recent unpaired tx
  const txs = await prisma.transaction.findMany({
    where: {
      date: { gte: since },
      transferPairId: null,
    },
    select: { id: true, accountId: true, amount: true, date: true, description: true },
    orderBy: { date: "asc" },
  });

  const transferCat = await prisma.category.findUnique({ where: { name: "Transferências" } });

  const negatives = txs.filter((t) => t.amount < 0);
  const positives = txs.filter((t) => t.amount > 0);
  const usedPositive = new Set<string>();

  let paired = 0;
  for (const out of negatives) {
    const target = Math.abs(out.amount);
    let bestMatch: typeof positives[number] | null = null;
    let bestDelta = Infinity;

    for (const inn of positives) {
      if (usedPositive.has(inn.id)) continue;
      if (inn.accountId === out.accountId) continue; // must be different account
      if (Math.abs(inn.amount - target) > 0.01) continue;
      const dayDelta = Math.abs(inn.date.getTime() - out.date.getTime()) / (1000 * 60 * 60 * 24);
      if (dayDelta > PAIR_DAY_WINDOW) continue;
      if (dayDelta < bestDelta) {
        bestDelta = dayDelta;
        bestMatch = inn;
      }
    }

    if (bestMatch) {
      usedPositive.add(bestMatch.id);
      const pairId = genPairId();
      await prisma.$transaction([
        prisma.transaction.update({
          where: { id: out.id },
          data: {
            transferPairId: pairId,
            categoryId: transferCat?.id ?? null,
            excludeFromBudget: true,
            status: "POSTED",
          },
        }),
        prisma.transaction.update({
          where: { id: bestMatch.id },
          data: {
            transferPairId: pairId,
            categoryId: transferCat?.id ?? null,
            excludeFromBudget: true,
            status: "POSTED",
          },
        }),
      ]);
      paired++;
    }
  }

  return { paired };
}

export async function unpairTransfer(txId: string) {
  const tx = await prisma.transaction.findUnique({ where: { id: txId }, select: { transferPairId: true } });
  if (!tx?.transferPairId) return { ok: false };
  await prisma.transaction.updateMany({
    where: { transferPairId: tx.transferPairId },
    data: { transferPairId: null, excludeFromBudget: false, categoryId: null, status: "REVIEW" },
  });
  return { ok: true };
}
