/**
 * Watch-only crypto: what the app can read from a public address, and how to value it.
 * No private key, seed phrase or signature ever enters the app — only addresses anyone could look up.
 */

export const CRYPTO_CHAINS = ["SOLANA", "BITCOIN"] as const;
export type CryptoChain = (typeof CRYPTO_CHAINS)[number];

export const CHAIN_LABEL: Record<CryptoChain, string> = { SOLANA: "Solana", BITCOIN: "Bitcoin" };

/** The assets the app can price. A token outside this list is ignored: a wrong price is worse than no row. */
export type CryptoSymbol = "BTC" | "SOL" | "USDC" | "USDT";

export const ASSET_NAME: Record<CryptoSymbol, string> = {
  BTC: "Bitcoin",
  SOL: "Solana",
  USDC: "USD Coin",
  USDT: "Tether",
};

const SATOSHIS = 100_000_000;
const LAMPORTS = 1_000_000_000;

/** Solana token mints the app knows how to price, with the decimals the chain stores them in. */
export const KNOWN_MINTS: Record<string, { symbol: CryptoSymbol; decimals: number }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", decimals: 6 },
};

export const satsToBtc = (sats: number) => sats / SATOSHIS;
export const lamportsToSol = (lamports: number) => lamports / LAMPORTS;

/**
 * Which chain an address belongs to, by its shape: Bitcoin uses bech32 ("bc1…") or base58 starting with 1/3;
 * Solana is base58 of 32 bytes. Returns null when it is neither, so a typo is refused instead of stored.
 */
export function detectChain(address: string): CryptoChain | null {
  const a = address.trim();
  if (/^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a)) return "BITCOIN";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return "SOLANA";
  return null;
}

/** The middle of a long address, hidden: "7xKX…9fTp". */
export function shortAddress(address: string) {
  return address.length <= 12 ? address : `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export type Holding = {
  symbol: CryptoSymbol;
  quantity: number;
  /** Unit price; null when the market source didn't answer for this asset. */
  priceBrl: number | null;
  priceUsd: number | null;
};

/** What a set of holdings is worth. Assets with no price count as zero and are reported apart. */
export function portfolioValue(holdings: Holding[]) {
  let brl = 0;
  let usd = 0;
  const unpriced: CryptoSymbol[] = [];
  for (const h of holdings) {
    if (h.priceBrl === null || h.priceUsd === null) {
      if (h.quantity > 0) unpriced.push(h.symbol);
      continue;
    }
    brl += h.quantity * h.priceBrl;
    usd += h.quantity * h.priceUsd;
  }
  return { brl, usd, unpriced };
}

/** How much the whole position moved in 24h, weighted by what each asset is worth now. */
export function portfolioChange24h(holdings: Holding[], change: (symbol: CryptoSymbol) => number | undefined) {
  let weighted = 0;
  let base = 0;
  for (const h of holdings) {
    const pct = change(h.symbol);
    if (h.priceBrl === null || pct === undefined) continue;
    const value = h.quantity * h.priceBrl;
    weighted += value * pct;
    base += value;
  }
  return base > 0 ? weighted / base : null;
}

/** Each asset's share of the position, biggest first: what the allocation bars draw. */
export function allocation(holdings: Holding[]) {
  const total = portfolioValue(holdings).brl;
  return holdings
    .filter((h) => h.priceBrl !== null)
    .map((h) => {
      const value = h.quantity * h.priceBrl!;
      return { symbol: h.symbol, quantity: h.quantity, value, share: total > 0 ? value / total : 0 };
    })
    .sort((a, b) => b.value - a.value);
}

/** Dust: balances too small to show as a position (a fraction of a cent). */
export function isDust(h: Holding) {
  return h.quantity <= 0 || (h.priceBrl !== null && h.quantity * h.priceBrl < 0.01);
}
