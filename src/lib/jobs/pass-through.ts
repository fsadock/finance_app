import { prisma } from "@/lib/infra/db";
import { newPassThroughs } from "@/lib/domain/pass-through";

const SELECT = {
  id: true,
  accountId: true,
  description: true,
  merchantRaw: true,
  counterpartyName: true,
  amount: true,
  chargeDate: true,
  excludeOverride: true,
} as const;

/** How far back a marked bill teaches the app: enough to recognize a monthly one that skipped a month. */
const LOOKBACK_MONTHS = 14;

/**
 * Marks what repeats a pass-through the owner already marked — next month's copy of the same bill, and the
 * money that funds it — so it never weighs on the budget again. See domain/pass-through.ts.
 */
export async function applyPassThroughs() {
  const since = new Date();
  since.setMonth(since.getMonth() - LOOKBACK_MONTHS);
  const txs = await prisma.transaction.findMany({ where: { chargeDate: { gte: since } }, select: SELECT });
  const found = newPassThroughs(txs);
  if (found.length > 0) {
    await prisma.transaction.updateMany({
      where: { id: { in: found.map((t) => t.id) } },
      data: { excludeOverride: true, excludeFromBudget: true },
    });
  }
  return { marked: found.length };
}
