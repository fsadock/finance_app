"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Loader2, RefreshCw, RotateCcw, Download } from "lucide-react";
import { CategorizePendingButton } from "@/components/transactions/categorize-pending-button";
import { errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { readJson } from "@/lib/client/api";
import { formatDateTime } from "@/lib/domain/format";
import { describeSync, syncAllAccounts } from "@/lib/client/sync";

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
      setMsg(describeSync(await syncAllAccounts()));
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

/**
 * Asks the institution for fresh data, instead of re-importing what Pluggy already had. Pluggy only goes
 * to the bank once a day on its own, so this is the button that actually makes the numbers newer — and the
 * reason it is separate from "Sincronizar" is that each collection counts against what the bank allows.
 */
export function CollectButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  async function collect() {
    setBusy(true);
    setDetail(null);
    setMsg("Consultando o banco… pode levar um minuto.");
    try {
      const data = await readJson(
        await fetch("/api/pluggy/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, collect: true }),
        })
      );
      const { collected, lastCollectedAt, refused } = data.collected ?? {};
      const novas = `${data.stats.transactions} transação(ões) nova(s)`;
      if (refused) {
        // a frase crua da Pluggy é em inglês e não ajuda o dono da conta; fica no title
        setDetail(refused);
        setMsg("Essa conexão não aceita consulta sob demanda — ela atualiza sozinha, uma vez por dia.");
      } else if (collected === false && lastCollectedAt) {
        setMsg(`O banco já respondeu ${formatDateTime(lastCollectedAt)} — reimportei esses dados · ${novas}`);
      } else if (collected === false) {
        setMsg("O banco ainda está respondendo. Os dados aparecem assim que terminar.");
      } else {
        setMsg(`✓ ${novas}`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(errorMessage(e, "Erro ao consultar o banco"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <button
        onClick={collect}
        disabled={busy}
        title="Pede dados novos direto na instituição, em vez de reimportar o que a Pluggy já tinha"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs hover:border-accent hover:text-accent disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
        Buscar no banco
      </button>
      {(msg || isPending) && (
        <span className="min-w-0 break-words text-xs text-fg-muted" title={detail ?? undefined}>
          {isPending ? "Atualizando…" : msg}
        </span>
      )}
    </span>
  );
}
