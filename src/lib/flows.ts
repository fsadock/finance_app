import type { Prisma } from "@/generated/prisma/client";

/**
 * Money model used by every report:
 *  - expense: money out (budget-relevant)
 *  - refund:  money in that reverses spending — card estornos, or any positive amount in an expense category
 *  - income:  money in an income category, or uncategorized money into a non-card account
 * Transfers, card bill payments and investment moves are excluded upstream via `BUDGET_RELEVANT`.
 */
export type Flow = "expense" | "refund" | "income";

export type FlowInput = {
  amount: number;
  categoryId: string | null;
  account: { type: string };
  category: { isIncome: boolean } | null;
};

export function classifyFlow(t: FlowInput): Flow {
  if (t.amount < 0) return "expense";
  if (t.category?.isIncome) return "income";
  if (t.account.type === "CREDIT_CARD" || t.categoryId !== null) return "refund";
  return "income";
}

/** Signed contribution to "spent": expenses add, refunds subtract, income is ignored. */
export function spendDelta(t: FlowInput) {
  const flow = classifyFlow(t);
  return flow === "expense" ? Math.abs(t.amount) : flow === "refund" ? -t.amount : 0;
}

export const FLOW_SELECT = {
  amount: true,
  categoryId: true,
  account: { select: { type: true } },
  category: { select: { isIncome: true } },
} as const;

/** Transactions that count as real income/spending: not transfers, not in excluded categories (card payments, investments…). */
export const BUDGET_RELEVANT: Prisma.TransactionWhereInput = {
  excludeFromBudget: false,
  OR: [{ categoryId: null }, { category: { excludeFromBudget: false } }],
};

export const INCOME_WHERE: Prisma.TransactionWhereInput = {
  AND: [
    BUDGET_RELEVANT,
    { amount: { gt: 0 } },
    { OR: [{ category: { isIncome: true } }, { categoryId: null, account: { type: { not: "CREDIT_CARD" } } }] },
  ],
};

export const REFUND_WHERE: Prisma.TransactionWhereInput = {
  AND: [
    BUDGET_RELEVANT,
    { amount: { gt: 0 } },
    { NOT: { category: { isIncome: true } } },
    { OR: [{ account: { type: "CREDIT_CARD" } }, { categoryId: { not: null } }] },
  ],
};

/** Expenses and refunds — everything that moves "spent". */
export const SPEND_WHERE: Prisma.TransactionWhereInput = {
  OR: [{ AND: [BUDGET_RELEVANT, { amount: { lt: 0 } }] }, REFUND_WHERE],
};
