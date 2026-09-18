import { prisma } from "@/lib/infra/db";

/** Every account (hidden ones too) with its two most recent card bills. */
export function getAccountsWithBills() {
  return prisma.account.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: { creditCardBills: { orderBy: { dueDate: "desc" }, take: 2 } },
  });
}

export function countAccounts() {
  return prisma.account.count();
}

/** Visible, non-card accounts a goal can be linked to. */
export function getGoalAccountOptions() {
  return prisma.account.findMany({
    where: { hidden: false, type: { not: "CREDIT_CARD" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, institution: true },
  });
}
