"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { CategorizePendingButton } from "@/components/transactions/categorize-pending-button";
import { errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    PluggyConnect?: new (opts: PluggyConnectOptions) => { init: () => void };
  }
}

type PluggyConnectOptions = {
  connectToken: string;
  includeSandbox?: boolean;
  /** Existing item to update (renew consent / fix credentials) instead of creating a new connection */
  updateItem?: string;
  onSuccess?: (data: { item: { id: string } }) => void;
  onError?: (err: unknown) => void;
  onClose?: () => void;
};

const SCRIPT_SRC = "https://cdn.pluggy.ai/pluggy-connect/v2.10.0/pluggy-connect.js";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.PluggyConnect) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar o Pluggy Connect")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar o Pluggy Connect"));
    document.body.appendChild(s);
  });
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data;
}

type Busy = null | "connect" | "sync";

/** Opens the Pluggy widget (new connection, or update of `itemId`) and syncs the item on success. */
function usePluggyConnect() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function open(itemId?: string) {
    setBusy("connect");
    setMsg(null);
    try {
      await loadScript();
      const tokenData = await readJson(
        await fetch("/api/pluggy/connect-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(itemId ? { itemId } : {}),
        })
      );
      if (!window.PluggyConnect) throw new Error("Pluggy Connect não carregou");

      const widget = new window.PluggyConnect({
        connectToken: tokenData.accessToken,
        includeSandbox: process.env.NODE_ENV !== "production",
        updateItem: itemId,
        onSuccess: async ({ item }) => {
          setBusy("sync");
          setMsg("Sincronizando…");
          try {
            const data = await readJson(
              await fetch("/api/pluggy/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId: item.id }),
              })
            );
            const s = data.stats;
            setMsg(
              `✓ ${s.accounts} contas, ${s.transactions} transações novas, ${s.deterministic + s.categorized} categorizadas` +
                (s.aiError ? ` · ⚠ ${s.aiError}` : ` · ${s.pendingReview} para revisar`)
            );
            startTransition(() => router.refresh());
          } catch (e) {
            setMsg(errorMessage(e, "Erro na sincronização"));
          } finally {
            setBusy(null);
          }
        },
        onError: (err) => {
          setMsg(typeof err === "string" ? err : "Erro na conexão.");
          setBusy(null);
        },
        // functional update: the closure's `busy` would be stale here
        onClose: () => setBusy((b) => (b === "connect" ? null : b)),
      });
      widget.init();
    } catch (e) {
      setMsg(errorMessage(e, "Erro"));
      setBusy(null);
    }
  }

  return { open, busy, setBusy, msg, setMsg, isPending, startTransition, router };
}

export function PluggyConnectButton() {
  const { open, busy, setBusy, msg, setMsg, isPending, startTransition, router } = usePluggyConnect();

  useEffect(() => {
    loadScript().catch(() => {});
  }, []);

  async function syncAll() {
    setBusy("sync");
    setMsg("Sincronizando todas as contas…");
    try {
      const data = await readJson(await fetch("/api/pluggy/sync", { method: "POST" }));
      const failed = (data.items ?? []).filter((it: { ok: boolean }) => !it.ok).length;
      const total = (data.items ?? []).reduce(
        (s: number, it: { stats?: { transactions?: number } }) => s + (it.stats?.transactions ?? 0),
        0
      );
      const post = data.post ?? {};
      setMsg(
        `✓ ${total} transações novas${failed ? ` · ${failed} conexão(ões) com erro` : ""}` +
          (post.aiError ? ` · ⚠ ${post.aiError}` : ` · ${post.pendingReview ?? 0} para revisar`)
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(errorMessage(e, "Erro"));
    } finally {
      setBusy(null);
    }
  }

  const secondary =
    "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50";
  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {(msg || isPending) && <span className="text-xs text-fg-muted max-w-md">{isPending ? "Atualizando…" : msg}</span>}
      <Button size="sm" onClick={() => open()} disabled={busy !== null}>
        {busy === "connect" ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
        Conectar conta
      </Button>
      <button onClick={syncAll} disabled={busy !== null} className={secondary}>
        {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Sincronizar
      </button>
      <CategorizePendingButton />
    </div>
  );
}

/** Renews an expired Open Finance consent / fixes a LOGIN_ERROR by updating the existing item. */
export function ReconnectButton({ itemId }: { itemId: string }) {
  const { open, busy, msg } = usePluggyConnect();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => open(itemId)}
        disabled={busy !== null}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
        Reconectar
      </button>
      {msg && <span className="text-xs text-fg-muted">{msg}</span>}
    </span>
  );
}
