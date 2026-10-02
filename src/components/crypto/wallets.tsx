"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";
import { addCryptoWallet, refreshCryptoWallets, removeCryptoWallet } from "@/app/actions/crypto";
import { CHAIN_LABEL, shortAddress, type CryptoChain } from "@/lib/domain/crypto";
import { formatBRL, formatCryptoAmount, formatDateTime, formatUSD } from "@/lib/domain/format";
import { PurchasesDialog, type PurchaseRow } from "@/components/crypto/purchases-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/money";

type WalletView = {
  id: string;
  label: string;
  chain: CryptoChain;
  address: string;
  lastSyncedAt: Date | null;
  lastError: string | null;
  brl: number;
  usd: number;
  holdings: { id: string; symbol: string; quantity: number; costBasis: number; priceBrl: number | null; priceUsd: number | null }[];
};

const CHAIN_COLOR: Record<CryptoChain, string> = { BITCOIN: "#f7931a", SOLANA: "#9945ff" };

/** The wallets being watched, what each holds now, and the form to add another. Public addresses only. */
export function CryptoWallets({ wallets, purchases }: { wallets: WalletView[]; purchases: Record<string, PurchaseRow[]> }) {
  const router = useRouter();
  const [openPurchases, setOpenPurchases] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await action();
      setResult({ ok: r.ok, text: r.ok ? (r.message ?? "") : (r.error ?? "") });
      if (r.ok) after?.();
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {wallets.map((w) => (
        <div key={w.id} className="rounded-2xl border border-border bg-bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                <span className="size-2 rounded-full" style={{ background: CHAIN_COLOR[w.chain] }} />
                {w.label}
              </p>
              <p className="font-mono text-xs text-fg-muted">
                {CHAIN_LABEL[w.chain]} · {shortAddress(w.address)}
              </p>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums"><Money>{formatBRL(w.brl)}</Money></div>
              <div className="text-xs text-fg-muted tabular-nums"><Money>{formatUSD(w.usd)}</Money></div>
            </div>
          </div>

          {w.holdings.length > 0 && (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {w.holdings.map((h) => {
                const value = h.priceBrl ? h.quantity * h.priceBrl : null;
                const cost = h.costBasis * h.quantity;
                const pnl = value !== null && cost > 0 ? value - cost : null;
                return (
                  <li key={h.id} className="py-2 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{h.symbol}</span>
                      <span className="tabular-nums">{value !== null ? formatBRL(value) : "—"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-fg-muted tabular-nums"><Money>{formatCryptoAmount(h.quantity)}</Money></span>
                      <span className="flex items-center gap-2">
                        {pnl !== null && (
                          <span className={cn("text-xs tabular-nums", pnl >= 0 ? "text-accent" : "text-danger")}>
                            {pnl >= 0 ? "+" : ""}
                            <Money>{formatBRL(pnl)}</Money>
                          </span>
                        )}
                        <button
                          onClick={() => setOpenPurchases(h.symbol)}
                          className="rounded-lg border border-border px-2 py-0.5 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
                        >
                          {h.costBasis > 0 ? `custo ${formatBRL(h.costBasis)}/un` : "informar aportes"}
                        </button>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-fg-subtle">
            <span>
              {w.lastError ? (
                <span className="text-danger">{w.lastError.slice(0, 80)}</span>
              ) : w.lastSyncedAt ? (
                `Lida em ${formatDateTime(w.lastSyncedAt)}`
              ) : (
                "Ainda não lida"
              )}
            </span>
            <button
              onClick={() => {
                if (confirm(`Remover ${w.label}? Só deixa de acompanhar; nada na blockchain muda.`)) {
                  run(() => removeCryptoWallet(w.id));
                }
              }}
              disabled={pending}
              className="p-1.5 text-fg-muted hover:text-danger"
              aria-label={`Remover ${w.label}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ))}

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addCryptoWallet(address, label),
              () => {
                setAddress("");
                setLabel("");
                setAdding(false);
              }
            );
          }}
          className="space-y-3 rounded-2xl border border-border bg-bg-card p-4"
        >
          <p className="text-sm text-fg-muted">
            Cole o <strong className="text-fg">endereço público</strong> que aparece na carteira (Bitcoin ou Solana). Nunca a
            frase de recuperação: com o endereço o app só lê saldos, e é tudo que ele precisa.
          </p>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="bc1… ou 7xKX…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Apelido (opcional): Phantom, cofre…"
            className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || address.trim().length < 20}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Cadastrar e ler
            </Button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-fg-muted hover:text-fg">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setAdding(true)} disabled={pending}>
            <Plus className="size-4" /> Adicionar carteira
          </Button>
          {wallets.length > 0 && (
            <button
              onClick={() => run(() => refreshCryptoWallets())}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg-hover disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Atualizar saldos
            </button>
          )}
        </div>
      )}

      {wallets.length === 0 && !adding && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Wallet className="size-4" /> Nenhuma carteira ainda. O saldo é lido direto da blockchain, pelo endereço público.
        </p>
      )}

      {result && <p className={cn("text-sm", result.ok ? "text-accent" : "text-danger")}>{result.text}</p>}

      {openPurchases && (
        <PurchasesDialog symbol={openPurchases} purchases={purchases[openPurchases] ?? []} onClose={() => setOpenPurchases(null)} />
      )}
    </div>
  );
}
