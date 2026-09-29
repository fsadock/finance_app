import { KNOWN_MINTS, lamportsToSol, satsToBtc, type CryptoChain, type CryptoSymbol } from "@/lib/domain/crypto";

/**
 * Reads balances straight from the blockchains, by public address. Phantom (or any wallet) only holds the
 * keys; what you own is public data, so nothing here needs a login, a key or the wallet app itself.
 *
 * Solana: the public RPC is enough for a few addresses. Set SOLANA_RPC_URL (Helius, QuickNode…) if it
 * starts refusing requests.
 */

const SOLANA_RPC = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
const MEMPOOL = "https://mempool.space/api";
const SPL_TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TIMEOUT_MS = 12_000;

type ChainBalance = { symbol: CryptoSymbol; quantity: number };

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Solana RPC respondeu ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`Solana RPC: ${body.error.message}`);
  return body.result;
}

type TokenAccounts = {
  value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } }[];
};

/** SOL plus the tokens the app knows how to price (see KNOWN_MINTS); anything else is left out. */
async function solanaBalances(address: string): Promise<ChainBalance[]> {
  const [lamports, accounts] = await Promise.all([
    rpc("getBalance", [address]) as Promise<{ value: number }>,
    rpc("getTokenAccountsByOwner", [address, { programId: SPL_TOKEN_PROGRAM }, { encoding: "jsonParsed" }]) as Promise<TokenAccounts>,
  ]);

  const bySymbol = new Map<CryptoSymbol, number>([["SOL", lamportsToSol(lamports.value)]]);
  for (const a of accounts.value) {
    const { mint, tokenAmount } = a.account.data.parsed.info;
    const known = KNOWN_MINTS[mint];
    if (!known) continue;
    const quantity = Number(tokenAmount.amount) / 10 ** tokenAmount.decimals;
    bySymbol.set(known.symbol, (bySymbol.get(known.symbol) ?? 0) + quantity);
  }
  return [...bySymbol].map(([symbol, quantity]) => ({ symbol, quantity }));
}

type AddressStats = { chain_stats: { funded_txo_sum: number; spent_txo_sum: number }; mempool_stats: { funded_txo_sum: number; spent_txo_sum: number } };

/** Confirmed balance plus what is still in the mempool, so a fresh transfer shows up right away. */
async function bitcoinBalance(address: string): Promise<ChainBalance[]> {
  const res = await fetch(`${MEMPOOL}/address/${address}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`mempool.space respondeu ${res.status}`);
  const { chain_stats: chain, mempool_stats: pending } = (await res.json()) as AddressStats;
  const sats = chain.funded_txo_sum - chain.spent_txo_sum + (pending.funded_txo_sum - pending.spent_txo_sum);
  return [{ symbol: "BTC", quantity: satsToBtc(sats) }];
}

export function readBalances(chain: CryptoChain, address: string): Promise<ChainBalance[]> {
  return chain === "SOLANA" ? solanaBalances(address) : bitcoinBalance(address);
}
