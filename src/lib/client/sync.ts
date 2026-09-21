import { readJson } from "./api";

type SyncSummary = { newTransactions: number; failedConnections: number; pendingReview: number; aiError: string | null };

/** Syncs every bank connection through the API (Pluggy + post-sync jobs). Browser-side. */
export async function syncAllAccounts(): Promise<SyncSummary> {
  const data = await readJson(await fetch("/api/pluggy/sync", { method: "POST" }));
  const items: { ok: boolean; stats?: { transactions?: number } }[] = data.items ?? [];
  return {
    newTransactions: items.reduce((s, it) => s + (it.stats?.transactions ?? 0), 0),
    failedConnections: items.filter((it) => !it.ok).length,
    pendingReview: data.post?.pendingReview ?? 0,
    aiError: data.post?.aiError ?? null,
  };
}

/** One-line result for the user, e.g. "Sincronizado · 3 transações novas · 2 para revisar". */
export function describeSync(s: SyncSummary) {
  const parts = ["Sincronizado", s.newTransactions === 0 ? "nada novo" : `${s.newTransactions} ${s.newTransactions === 1 ? "transação nova" : "transações novas"}`];
  if (s.failedConnections) parts.push(`${s.failedConnections} ${s.failedConnections === 1 ? "conexão" : "conexões"} com erro`);
  if (s.aiError) parts.push(`⚠ ${s.aiError}`);
  else if (s.pendingReview) parts.push(`${s.pendingReview} para revisar`);
  return parts.join(" · ");
}
