import { prisma } from "@/lib/infra/db";
import { logger } from "@/lib/infra/logger";
import { ASSET_NAME, isDust, portfolioValue, type CryptoSymbol, type Holding } from "@/lib/domain/crypto";
import { readBalances } from "@/lib/market/chains";
import { getQuotes } from "@/lib/market/prices";

/**
 * Reads every watch-only wallet from its blockchain, prices it, and writes the result as Investment rows on the
 * wallet's account — the same shape banks' investments use, so net worth and the investments page need no
 * special case for crypto.
 *
 * Cost basis isn't on the chain: it stays as whatever the owner typed, and is kept across syncs.
 */
export async function syncCryptoWallets() {
  const wallets = await prisma.cryptoWallet.findMany({ include: { account: { select: { id: true } } } });
  if (wallets.length === 0) return { wallets: 0, failed: 0 };

  const quotes = await getQuotes();
  const priceOf = (symbol: CryptoSymbol) => quotes.find((q) => q.symbol === symbol) ?? null;
  let failed = 0;

  for (const wallet of wallets) {
    try {
      const balances = await readBalances(wallet.chain, wallet.address);
      const holdings: Holding[] = balances.map((b) => {
        const quote = priceOf(b.symbol);
        return { symbol: b.symbol, quantity: b.quantity, priceBrl: quote?.brl ?? null, priceUsd: quote?.usd ?? null };
      });
      const worth = holdings.filter((h) => !isDust(h));

      // What the owner paid, kept per asset across syncs: the chain knows the amount, never the cost.
      const previous = new Map(
        (await prisma.investment.findMany({ where: { accountId: wallet.accountId }, select: { ticker: true, costBasis: true } }))
          .map((i) => [i.ticker, i.costBasis])
      );

      await prisma.$transaction([
        prisma.investment.deleteMany({ where: { accountId: wallet.accountId } }),
        prisma.investment.createMany({
          data: worth.map((h) => ({
            accountId: wallet.accountId,
            name: ASSET_NAME[h.symbol],
            ticker: h.symbol,
            type: "CRYPTO" as const,
            quantity: h.quantity,
            currentPrice: h.priceBrl ?? 0,
            costBasis: previous.get(h.symbol) ?? 0,
          })),
        }),
        prisma.account.update({ where: { id: wallet.accountId }, data: { balance: portfolioValue(worth).brl } }),
        prisma.cryptoWallet.update({ where: { id: wallet.id }, data: { lastSyncedAt: new Date(), lastError: null } }),
      ]);
      logger.info("crypto:synced", { wallet: wallet.label, assets: worth.length });
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      await prisma.cryptoWallet.update({ where: { id: wallet.id }, data: { lastError: message } });
      logger.error("crypto:failed", { wallet: wallet.label, error: message });
    }
  }
  return { wallets: wallets.length, failed };
}
