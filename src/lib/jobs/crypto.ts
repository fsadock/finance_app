import { prisma } from "@/lib/infra/db";
import { logger } from "@/lib/infra/logger";
import { ASSET_NAME, averageCost, isDust, portfolioValue, type CryptoSymbol, type Holding } from "@/lib/domain/crypto";
import { readBalances } from "@/lib/market/chains";
import { getQuotes } from "@/lib/market/prices";

/**
 * Reads every watch-only wallet from its blockchain, prices it, and writes the result as Investment rows on the
 * wallet's account — the same shape banks' investments use, so net worth and the investments page need no
 * special case for crypto.
 *
 * Cost basis isn't on the chain: it comes from the purchases the owner recorded (weighted average).
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

      // What the owner paid, from the purchases recorded for each asset
      const purchases = await prisma.cryptoPurchase.findMany({
        where: { symbol: { in: worth.map((h) => h.symbol) } },
        select: { symbol: true, quantity: true, totalBrl: true },
      });
      const costOf = (symbol: CryptoSymbol) => averageCost(purchases.filter((p) => p.symbol === symbol)).perUnit;

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
            costBasis: costOf(h.symbol),
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
