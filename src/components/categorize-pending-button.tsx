"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";

export function CategorizePendingButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    setBusy(true);
    setMsg("Categorizando… (pode levar alguns minutos)");
    try {
      const res = await fetch("/api/ai/categorize", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
      const done = data.deterministic + data.applied;
      setMsg(
        data.error
          ? `${done} categorizadas · ${data.remaining} pendentes · ${data.error}`
          : `✓ ${done} categorizadas (${data.fromAI} pela IA) · ${data.remaining} ainda para revisar`
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {msg && <span className="text-xs text-fg-muted max-w-md">{msg}</span>}
      <button
        onClick={run}
        disabled={busy}
        className={
          compact
            ? "inline-flex items-center gap-1 text-xs text-fg-muted hover:text-accent disabled:opacity-50"
            : "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50"
        }
        title="Aplica regras e IA em todas as transações pendentes"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
        Categorizar pendentes
      </button>
    </span>
  );
}
