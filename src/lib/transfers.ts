import { prisma } from "./db";
import {
  TRANSFER_PAIR_DAY_WINDOW,
  TRANSFER_AMOUNT_TOLERANCE_RATE,
  TRANSFER_AMOUNT_TOLERANCE_FLOOR,
  TRANSFER_DETECTION_DAYS_BACK,
} from "./constants";

function genPairId() {
  return `pair_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function amountTolerance(amount: number) {
  return Math.max(TRANSFER_AMOUNT_TOLERANCE_FLOOR, Math.abs(amount) * TRANSFER_AMOUNT_TOLERANCE_RATE);
}

type TxStub = { id: string; accountId: string; amount: number; date: Date };

/** Pure matching logic — finds pairs of outgoing/incoming transactions that look like transfers. */
export function findTransferPairs(txs: TxStub[]): Array<[TxStub, TxStub]> {
  const negatives = txs.filter((t) => t.amount < 0);
  const positives = txs.filter((t) => t.amount > 0);
  const usedPositive = new Set<string>();
  const pairs: Array<[TxStub, TxStub]> = [];

  for (const out of negatives) {
    const target = Math.abs(out.amount);
    const tol = amountTolerance(out.amount);
    let bestMatch: TxStub | null = null;
    let bestDelta = Infinity;

    for (const inn of positives) {
      if (usedPositive.has(inn.id)) continue;
      if (inn.accountId === out.accountId) continue;
      if (Math.abs(inn.amount - target) > tol) continue;
      const dayDelta = Math.abs(inn.date.getTime() - out.date.getTime()) / (1000 * 60 * 60 * 24);
      if (dayDelta > TRANSFER_PAIR_DAY_WINDOW) continue;
      if (dayDelta < bestDelta) {
        bestDelta = dayDelta;
        bestMatch = inn;
      }
    }

    if (bestMatch) {
      usedPositive.add(bestMatch.id);
      pairs.push([out, bestMatch]);
    }
  }

  return pairs;
}

export async function detectTransfers(daysBack = TRANSFER_DETECTION_DAYS_BACK) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const [txs, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        date: { gte: since },
        transferPairId: null,
        // investment moves (Aplicação/Resgate) and yield are not transfers between accounts
        NOT: { category: { name: { in: ["Investimentos", "Rendimentos"] } } },
      },
      select: { id: true, accountId: true, amount: true, date: true, account: { select: { type: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.category.findMany({ where: { name: { in: ["Transferências", "Pagamento de fatura"] } } }),
  ]);
  const catId = (name: string) => categories.find((c) => c.name === name)?.id ?? null;
  const accountType = new Map(txs.map((t) => [t.id, t.account.type]));

  const pairs = findTransferPairs(txs);
  for (const [out, inn] of pairs) {
    const pairId = genPairId();
    // money landing on a credit card is a bill payment, not a transfer
    const isBillPayment = accountType.get(inn.id) === "CREDIT_CARD";
    const data = {
      transferPairId: pairId,
      categoryId: catId(isBillPayment ? "Pagamento de fatura" : "Transferências"),
      excludeFromBudget: true,
      status: "POSTED" as const,
    };
    await prisma.$transaction([
      prisma.transaction.update({ where: { id: out.id }, data }),
      prisma.transaction.update({ where: { id: inn.id }, data }),
    ]);
  }

  return { paired: pairs.length };
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
