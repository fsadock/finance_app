import { prisma } from "@/lib/infra/db";
import type { Prisma } from "@/generated/prisma/client";

export async function getReviewTransactions(limit = 8) {
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "REVIEW" },
      include: { account: true, category: true },
      orderBy: { date: "desc" },
      take: limit,
    }),
    prisma.transaction.count({ where: { status: "REVIEW" } }),
  ]);
  return { items, total };
}

/** One page of the transaction list plus totals over every matching transaction. */
export async function getTransactionsPage(where: Prisma.TransactionWhereInput, page: number, pageSize: number) {
  const [txs, count, outflow, inflow] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { account: true, category: true, tags: true },
      orderBy: [{ date: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where: { AND: [where, { amount: { lt: 0 } }] }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { AND: [where, { amount: { gt: 0 } }] }, _sum: { amount: true } }),
  ]);
  return { txs, count, outflow, inflow };
}

/** Accounts and tags for the transaction filters. */
export async function getTransactionFilterOptions() {
  const [accounts, tags] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { accounts, tags };
}

/** Every matching transaction, newest first, for the CSV export. */
export function getTransactionsForExport(where: Prisma.TransactionWhereInput) {
  return prisma.transaction.findMany({
    where,
    include: { account: true, category: true, tags: true },
    orderBy: { date: "desc" },
  });
}

export function countTransactions(where: Prisma.TransactionWhereInput) {
  return prisma.transaction.count({ where });
}

