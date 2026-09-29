import { prisma } from "@/lib/infra/db";
import { portfolioValue, type CryptoSymbol, type Holding } from "@/lib/domain/crypto";
import { getQuotes, getUsdBrl } from "@/lib/market/prices";

/** Wallets with what they hold, priced now: what the Cripto section shows. */
export async function getCryptoPortfolio() {
  const [wallets, quotes, dollar] = await Promise.all([
    prisma.cryptoWallet.findMany({
      orderBy: { createdAt: "asc" },
      include: { account: { select: { id: true, balance: true, investments: true } } },
    }),
    getQuotes(),
    getUsdBrl(),
  ]);

  const priced = wallets.map((w) => {
    // o id e o custo viajam junto: o custo não está na blockchain, quem informa é o dono
    const holdings: (Holding & { id: string; costBasis: number })[] = w.account.investments.map((i) => {
      const quote = quotes.find((q) => q.symbol === i.ticker);
      return {
        id: i.id,
        symbol: (i.ticker ?? "BTC") as CryptoSymbol,
        quantity: i.quantity,
        costBasis: i.costBasis,
        priceBrl: quote?.brl ?? i.currentPrice,
        priceUsd: quote?.usd ?? null,
      };
    });
    return {
      id: w.id,
      label: w.label,
      chain: w.chain,
      address: w.address,
      lastSyncedAt: w.lastSyncedAt,
      lastError: w.lastError,
      holdings,
      ...portfolioValue(holdings),
    };
  });

  const total = {
    brl: priced.reduce((s, w) => s + w.brl, 0),
    usd: priced.reduce((s, w) => s + w.usd, 0),
  };
  return { wallets: priced, quotes, dollar, total };
}
