import { logger } from "@/lib/infra/logger";
import type { CryptoSymbol } from "@/lib/domain/crypto";

/**
 * Live market data from public sources, no key required:
 * - crypto quotes and candles from Binance, which has BRL pairs (BTCBRL, SOLBRL), so nothing is converted twice
 * - the commercial dollar from AwesomeAPI (Banco Central's reference), which is the rate people actually quote
 *
 * Every call is cached for a short while: the screen refreshes often, the source is asked rarely.
 */

const BINANCE = "https://api.binance.com/api/v3";
const AWESOME = "https://economia.awesomeapi.com.br";

type CacheEntry = { value: unknown; expiresAt: number };
const cache = ((globalThis as { financasMarketCache?: Map<string, CacheEntry> }).financasMarketCache ??= new Map());

/** One in-flight request per key, and its answer reused until it goes stale. */
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  try {
    const value = await load();
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  } catch (e) {
    logger.warn("market:failed", { key, error: e instanceof Error ? e.message : String(e) });
    // stale data beats an empty screen; null only when there was never an answer
    return (hit?.value as T) ?? null;
  }
}

async function json(url: string, timeoutMs = 8_000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
  return res.json();
}

export type Quote = {
  symbol: CryptoSymbol;
  brl: number;
  usd: number;
  /** Change over the last 24h, in percent. */
  change24h: number;
};

type BinanceTicker = { symbol: string; lastPrice: string; priceChangePercent: string };

const PAIRS = ["BTCBRL", "BTCUSDT", "SOLBRL", "SOLUSDT", "USDTBRL"] as const;

/** BTC, SOL and the dollar-pegged tokens, priced in both currencies. */
export async function getQuotes(): Promise<Quote[]> {
  const tickers = await cached("quotes", 20_000, async () => {
    const data = (await json(`${BINANCE}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(PAIRS))}`)) as BinanceTicker[];
    return new Map(data.map((t) => [t.symbol, t]));
  });
  if (!tickers) return [];

  const price = (pair: string) => Number(tickers.get(pair)?.lastPrice ?? NaN);
  const change = (pair: string) => Number(tickers.get(pair)?.priceChangePercent ?? 0);
  const usdtBrl = price("USDTBRL");

  const quotes: Quote[] = [
    { symbol: "BTC", brl: price("BTCBRL"), usd: price("BTCUSDT"), change24h: change("BTCUSDT") },
    { symbol: "SOL", brl: price("SOLBRL"), usd: price("SOLUSDT"), change24h: change("SOLUSDT") },
    // dollar-pegged: worth one dollar by design, and the real question is what the dollar is worth
    { symbol: "USDC", brl: usdtBrl, usd: 1, change24h: change("USDTBRL") },
    { symbol: "USDT", brl: usdtBrl, usd: 1, change24h: change("USDTBRL") },
  ];
  return quotes.filter((q) => Number.isFinite(q.brl) && Number.isFinite(q.usd));
}

export type DollarRate = { rate: number; change24h: number; at: string };

/** The commercial dollar (venda), the rate quoted in the news. */
export async function getUsdBrl(): Promise<DollarRate | null> {
  return cached("usdbrl", 60_000, async () => {
    const data = (await json(`${AWESOME}/last/USD-BRL`)) as { USDBRL: { ask: string; pctChange: string; create_date: string } };
    return {
      rate: Number(data.USDBRL.ask),
      change24h: Number(data.USDBRL.pctChange),
      at: data.USDBRL.create_date,
    };
  });
}

export const CHART_SYMBOLS = ["BTC", "SOL", "USDC", "USDT", "USDBRL"] as const;
export type ChartSymbol = (typeof CHART_SYMBOLS)[number];

export const CHART_RANGES = ["1d", "7d", "30d", "1y"] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export type Candle = { t: number; close: number };

/** Binance interval and how many candles cover each range. */
const BINANCE_RANGE: Record<ChartRange, { interval: string; limit: number }> = {
  "1d": { interval: "5m", limit: 288 },
  "7d": { interval: "1h", limit: 168 },
  "30d": { interval: "4h", limit: 180 },
  "1y": { interval: "1d", limit: 365 },
};

const AWESOME_DAYS: Record<ChartRange, number> = { "1d": 2, "7d": 8, "30d": 31, "1y": 366 };

/** Closing prices over a range: crypto in BRL from Binance, the dollar from AwesomeAPI. */
export async function getCandles(symbol: ChartSymbol, range: ChartRange): Promise<Candle[]> {
  const ttl = range === "1d" ? 60_000 : 10 * 60_000;
  const candles = await cached(`chart:${symbol}:${range}`, ttl, async () => {
    if (symbol === "USDBRL") {
      const rows = (await json(`${AWESOME}/json/daily/USD-BRL/${AWESOME_DAYS[range]}`)) as { ask: string; timestamp: string }[];
      return rows
        .map((r) => ({ t: Number(r.timestamp) * 1000, close: Number(r.ask) }))
        .sort((a, b) => a.t - b.t);
    }
    const { interval, limit } = BINANCE_RANGE[range];
    const rows = (await json(`${BINANCE}/klines?symbol=${symbol}BRL&interval=${interval}&limit=${limit}`)) as unknown[][];
    return rows.map((r) => ({ t: Number(r[0]), close: Number(r[4]) }));
  });
  return candles ?? [];
}
