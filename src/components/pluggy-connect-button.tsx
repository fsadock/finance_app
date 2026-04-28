"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plug, Loader2, RefreshCw, Sparkles } from "lucide-react";

declare global {
  interface Window {
    PluggyConnect?: new (opts: PluggyConnectOptions) => { init: () => void };
  }
}

type PluggyConnectOptions = {
  connectToken: string;
  includeSandbox?: boolean;
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
      existing.addEventListener("error", () => reject(new Error("Failed to load Pluggy Connect")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Pluggy Connect"));
    document.body.appendChild(s);
  });
}

export function PluggyConnectButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "connect" | "sync" | "reclassify">(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    loadScript().catch((e) => setMsg(e.message));
  }, []);

  async function connect() {
    setBusy("connect");
    setMsg(null);
    try {
      await loadScript();
      const tokenRes = await fetch("/api/pluggy/connect-token", { method: "POST" });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error ?? "Token error");
      if (!window.PluggyConnect) throw new Error("Pluggy Connect not loaded");

      const widget = new window.PluggyConnect({
        connectToken: tokenData.accessToken,
        includeSandbox: true,
        onSuccess: async ({ item }) => {
          setBusy("sync");
          setMsg("Sincronizando…");
          const res = await fetch("/api/pluggy/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: item.id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Sync error");
          setMsg(`✓ ${data.stats.accounts} contas, ${data.stats.transactions} transações.`);
          startTransition(() => router.refresh());
          setBusy(null);
        },
        onError: (err) => {
          setMsg(typeof err === "string" ? err : "Erro na conexão.");
          setBusy(null);
        },
        onClose: () => {
          if (busy === "connect") setBusy(null);
        },
      });
      widget.init();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
      setBusy(null);
    }
  }

  async function syncAll() {
    setBusy("sync");
    setMsg("Sincronizando todas as contas…");
    try {
      const res = await fetch("/api/pluggy/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync error");
      const total = data.items?.reduce(
        (s: number, it: { stats?: { transactions?: number } }) => s + (it.stats?.transactions ?? 0),
        0,
      ) ?? 0;
      setMsg(`✓ ${total} transações sincronizadas.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function reclassify() {
    if (!confirm("Apagar regras da IA e reclassificar tudo? (Suas escolhas manuais ficam intactas)")) return;
    setBusy("reclassify");
    setMsg("Reclassificando…");
    try {
      const res = await fetch("/api/admin/reset-ai", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setMsg(`✓ ${data.rulesDeleted} regras apagadas, ${data.txReset} tx resetadas, ${data.recategorized} recategorizadas.`);
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={connect}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
      >
        {busy === "connect" ? <Loader2 className="size-3.5 animate-spin" /> : <Plug className="size-3.5" />}
        Conectar conta
      </button>
      <button
        onClick={syncAll}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50"
      >
        {busy === "sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Sincronizar
      </button>
      <button
        onClick={reclassify}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50"
        title="Apaga regras da IA e reclassifica tudo (mantém suas escolhas)"
      >
        {busy === "reclassify" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Reclassificar IA
      </button>
      {(msg || isPending) && <span className="text-xs text-fg-muted">{isPending ? "Atualizando…" : msg}</span>}
    </div>
  );
}
