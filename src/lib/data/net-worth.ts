import { prisma } from "@/lib/infra/db";
import { lastMonthKeys, monthBounds, monthKey, monthKeyToDate } from "@/lib/domain/format";
import { getMonthlyCashflow } from "@/lib/data/cashflow";

export async function getNetWorth() {
  const accounts = await prisma.account.findMany({ where: { hidden: false }, select: { balance: true } });
  let assets = 0;
  let debts = 0;
  for (const a of accounts) {
    if (a.balance >= 0) assets += a.balance;
    else debts += Math.abs(a.balance);
  }
  return { assets, debts, net: assets - debts };
}

/**
 * Net worth at the end of each month. Uses daily balance snapshots when available; for months
 * before the first snapshot it reconstructs backwards from cashflow (marked `estimated`).
 */
export async function getNetWorthHistory(monthsBack = 12) {
  const keys = lastMonthKeys(monthsBack);
  const [accounts, snapshots, cashflow] = await Promise.all([
    prisma.account.findMany({ where: { hidden: false }, select: { id: true, balance: true } }),
    prisma.balanceSnapshot.findMany({
      where: { account: { hidden: false } },
      orderBy: { date: "asc" },
      select: { accountId: true, date: true, balance: true },
    }),
    getMonthlyCashflow(monthsBack),
  ]);

  const current = accounts.reduce((s, a) => s + a.balance, 0);
  const byAccount = new Map<string, { date: Date; balance: number }[]>();
  for (const s of snapshots) {
    if (!byAccount.has(s.accountId)) byAccount.set(s.accountId, []);
    byAccount.get(s.accountId)!.push(s);
  }
  const firstSnapshot = snapshots[0]?.date;

  // Backwards reconstruction from current net worth (fallback)
  const reconstructed = new Map<string, number>();
  let running = current;
  for (const m of [...cashflow].reverse()) {
    reconstructed.set(m.month, running);
    running -= m.net;
  }

  const currentKey = monthKey(new Date());
  return keys.map((key) => {
    if (key === currentKey) return { month: key, value: current, estimated: false };
    const monthEnd = monthBounds(monthKeyToDate(key)).end;
    if (!firstSnapshot || firstSnapshot >= monthEnd) {
      return { month: key, value: reconstructed.get(key) ?? current, estimated: true };
    }
    let value = 0;
    let estimated = false;
    for (const a of accounts) {
      const list = byAccount.get(a.id);
      if (!list || list.length === 0) {
        value += a.balance;
        estimated = true;
        continue;
      }
      let last: number | null = null;
      for (const s of list) {
        if (s.date >= monthEnd) break;
        last = s.balance;
      }
      if (last === null) {
        // account's history starts later — assume flat before its first snapshot
        last = list[0]!.balance;
        estimated = true;
      }
      value += last;
    }
    return { month: key, value, estimated };
  });
}
