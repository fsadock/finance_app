"use client";

import { Sparkles, Loader2, ArrowLeftRight } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AIActions() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<null | "categorize" | "recurrings" | "transfers">(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(action: "categorize" | "recurrings" | "transfers") {
    setBusy(action);
    setMsg(null);
    try {
      const path =
        action === "categorize" ? "/api/ai/categorize"
        : action === "recurrings" ? "/api/ai/recurrings"
        : "/api/transfers/detect";
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falhou");
      if (action === "categorize") {
        const r = data.fromRules ?? 0;
        const a = data.fromAI ?? 0;
        setMsg(`${data.applied} categorizadas (${r} via regras salvas, ${a} via IA).`);
      } else if (action === "transfers") {
        setMsg(`${data.paired} transferência(s) detectada(s).`);
      } else {
        setMsg(`${data.detected} recorrência(s) detectada(s).`);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => run("categorize")}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50"
      >
        {busy === "categorize" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Categorizar com IA
      </button>
      <button
        onClick={() => run("recurrings")}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50"
      >
        {busy === "recurrings" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Detectar recorrências
      </button>
      <button
        onClick={() => run("transfers")}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm disabled:opacity-50"
      >
        {busy === "transfers" ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowLeftRight className="size-3.5" />}
        Detectar transferências
      </button>
      {(msg || isPending) && (
        <span className="text-xs text-fg-muted">{isPending ? "Atualizando…" : msg}</span>
      )}
    </div>
  );
}
