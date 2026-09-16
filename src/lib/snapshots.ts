import { prisma } from "./db";
import { startOfDay } from "./format";

/** Upserts today's balance snapshot for the given accounts (or all accounts). Idempotent per day. */
export async function snapshotBalances(accountIds?: string[]) {
  const date = startOfDay(new Date());
  const accounts = await prisma.account.findMany({
    where: accountIds ? { id: { in: accountIds } } : undefined,
    select: { id: true, balance: true },
  });
  await prisma.$transaction(
    accounts.map((a) =>
      prisma.balanceSnapshot.upsert({
        where: { accountId_date: { accountId: a.id, date } },
        create: { accountId: a.id, date, balance: a.balance },
        update: { balance: a.balance },
      })
    )
  );
  return accounts.length;
}
