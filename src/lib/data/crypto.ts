import { prisma } from "@/lib/infra/db";
import { allocation, averageCost, portfolioChange24h, portfolioValue, type CryptoSymbol, type Holding } from "@/lib/domain/crypto";
import { DAY_MS } from "@/lib/domain/format";
import { getQuotes, getUsdBrl } from "@/lib/market/prices";

/** How far back the wallets' history goes on the chart. */
const HISTORY_DAYS = 90;

/** Every wallet with what it holds, priced now. Shared by the summary and the full page. */
async function pricedWallets() {
  const [wallets, quotes, purchases] = await Promise.all([
    prisma.cryptoWallet.findMany({
      orderBy: { createdAt: "asc" },
      include: { account: { select: { id: true, investments: true } } },
    }),
    getQuotes(),
    prisma.cryptoPurchase.findMany({ orderBy: { date: "desc" } }),
  ]);

  const costOf = (symbol: string) => averageCost(purchases.filter((p) => p.symbol === symbol));

  const priced = wallets.map((w) => {
    // the id and the cost travel along: the cost isn't on the chain, the owner is the one who knows it
    const holdings: (Holding & { id: string; costBasis: number })[] = w.account.investments.map((i) => {
      const quote = quotes.find((q) => q.symbol === i.ticker);
      return {
        id: i.id,
        symbol: (i.ticker ?? "BTC") as CryptoSymbol,
        quantity: i.quantity,
        // o custo vem das compras informadas, não do que estava gravado no último sync
        costBasis: costOf(i.ticker ?? "").perUnit,
        // the stored price is the last sync's; the live quote wins while the screen is open
        priceBrl: quote?.brl ?? i.currentPrice,
        priceUsd: quote?.usd ?? null,
      };
    });
    return {
      id: w.id,
      accountId: w.accountId,
      label: w.label,
      chain: w.chain,
      address: w.address,
      lastSyncedAt: w.lastSyncedAt,
      lastError: w.lastError,
      holdings,
      ...portfolioValue(holdings),
    };
  });

  const holdings = priced.flatMap((w) => w.holdings);
  return {
    wallets: priced,
    quotes,
    purchases,
    holdings,
    total: {
      brl: priced.reduce((s, w) => s + w.brl, 0),
      usd: priced.reduce((s, w) => s + w.usd, 0),
      change24h: portfolioChange24h(holdings, (symbol) => quotes.find((q) => q.symbol === symbol)?.change24h),
    },
  };
}

/** The one line the Investimentos page shows: totals and which assets, without the chart's history. */
export async function getCryptoSummary() {
  const { wallets, total, holdings } = await pricedWallets();
  return { wallets: wallets.length, total, symbols: [...new Set(allocation(holdings).map((a) => a.symbol))] };
}

/** Everything the Cripto page draws: wallets, allocation, the dollar and the wallets' value day by day. */
export async function getCryptoPortfolio() {
  const [{ wallets, quotes, holdings, total, purchases }, dollar] = await Promise.all([pricedWallets(), getUsdBrl()]);

  // Daily balance snapshots, which the app already records for every account
  const snapshots = await prisma.balanceSnapshot.findMany({
    where: {
      accountId: { in: wallets.map((w) => w.accountId) },
      date: { gte: new Date(Date.now() - HISTORY_DAYS * DAY_MS) },
    },
    select: { date: true, balance: true },
    orderBy: { date: "asc" },
  });
  const byDay = new Map<number, number>();
  for (const s of snapshots) byDay.set(s.date.getTime(), (byDay.get(s.date.getTime()) ?? 0) + s.balance);

  // as compras, por ativo, para a tela de aportes
  const bySymbol = new Map<string, { id: string; date: Date; quantity: number; totalBrl: number }[]>();
  for (const p of purchases) {
    if (!bySymbol.has(p.symbol)) bySymbol.set(p.symbol, []);
    bySymbol.get(p.symbol)!.push({ id: p.id, date: p.date, quantity: p.quantity, totalBrl: p.totalBrl });
  }

  return {
    wallets,
    quotes,
    dollar,
    total,
    allocation: allocation(holdings),
    history: [...byDay].map(([t, brl]) => ({ t, brl })),
    purchases: Object.fromEntries(bySymbol),
  };
}
