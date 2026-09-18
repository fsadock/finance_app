"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { previewReclassifyAction, runReclassifyAction, undoReclassifyAction } from "@/app/actions/reclassify";
import type { ReclassifyPreview } from "@/lib/reclassify";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { RECLASSIFY_CONFIRMATION } from "@/lib/constants";


export function ReclassifyPanel({ backup }: { backup: { createdAt: string; rules: number; transactions: number } | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState<ReclassifyPreview | null>(null);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadPreview() {
    setMsg(null);
    startTransition(async () => setPreview(await previewReclassifyAction()));
  }

  function run() {
    startTransition(async () => {
      const r = await runReclassifyAction(typed);
      if (!r.ok) return setMsg(r.error);
      setMsg(
        `✓ ${r.rulesDeleted} regras da IA apagadas, ${r.txReset} transações reenviadas, ${r.recategorized} recategorizadas, ${r.remaining} para revisar.` +
          (r.error ? ` ⚠ ${r.error}` : "")
      );
      setPreview(null);
      setTyped("");
      router.refresh();
    });
  }

  function undo() {
    if (!confirm("Restaurar as regras e categorias de antes da última reclassificação?")) return;
    startTransition(async () => {
      const r = await undoReclassifyAction();
      setMsg(
        r.ok
          ? `✓ Desfeito: ${r.rulesRestored} regras e ${r.transactionsRestored} transações restauradas` +
              (r.skippedChangedByYou ? ` (${r.skippedChangedByYou} mantidas porque você mudou depois).` : ".")
          : r.error
      );
      router.refresh();
    });
  }

  return (
    <Card className="mt-10 border-danger/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h2 className="font-semibold">Zona de risco · Reclassificar com IA</h2>
            <p className="text-sm text-fg-muted mt-1">
              Apaga todas as regras criadas pela IA e envia de novo para a IA as transações que elas classificaram. Suas regras,
              categorias escolhidas por você e classificações automáticas (transferências, faturas, investimentos) não são
              alteradas. Usa créditos da API Anthropic. Um ponto de restauração é salvo antes.
            </p>
          </div>

          {backup && (
            <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg bg-bg-elev border border-border px-3 py-2 text-sm">
              <span className="text-fg-muted">
                Ponto de restauração de {formatDateTime(backup.createdAt)}: {backup.rules} regras, {backup.transactions} transações
              </span>
              <button
                onClick={undo}
                disabled={pending}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-border hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" /> Desfazer última reclassificação
              </button>
            </div>
          )}

          {!preview ? (
            <button
              onClick={loadPreview}
              disabled={pending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 text-sm disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Ver o que seria alterado…
            </button>
          ) : (
            <div className="rounded-lg border border-border p-4 space-y-3 text-sm">
              {preview.aiUnavailable ? (
                <p className="text-warn">{preview.aiUnavailable} A reclassificação está bloqueada.</p>
              ) : null}
              <ul className="space-y-1">
                <li>
                  <strong>{preview.aiRules}</strong> regras da IA serão apagadas
                </li>
                <li>
                  <strong>{preview.transactionsToReset}</strong> transações voltarão para a IA
                  {preview.byCategory.length > 0 && (
                    <span className="text-fg-muted">
                      {" "}
                      (
                      {preview.byCategory
                        .slice(0, 6)
                        .map((c) => `${c.name} ${c.count}`)
                        .join(", ")}
                      {preview.byCategory.length > 6 ? ", …" : ""})
                    </span>
                  )}
                </li>
                <li className="flex items-center gap-1.5 text-accent">
                  <ShieldCheck className="size-4" /> Protegidas: {preview.protectedUserRules} regras suas e {preview.protectedTransactions}{" "}
                  transações categorizadas por você ou automaticamente
                </li>
              </ul>
              <label className="block text-xs text-fg-muted">
                Para confirmar, digite <code className="text-fg">{RECLASSIFY_CONFIRMATION}</code>
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={pending || Boolean(preview.aiUnavailable)}
                  className="w-48 bg-bg-elev border border-border rounded-md px-2 py-1 outline-none focus:border-danger font-mono"
                  placeholder={RECLASSIFY_CONFIRMATION}
                  autoComplete="off"
                />
                <button
                  onClick={run}
                  disabled={pending || typed.trim() !== RECLASSIFY_CONFIRMATION || Boolean(preview.aiUnavailable) || preview.transactionsToReset + preview.aiRules === 0}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-danger text-bg font-medium text-sm disabled:opacity-40"
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" />} Reclassificar
                </button>
                <button onClick={() => { setPreview(null); setTyped(""); }} disabled={pending} className="text-xs text-fg-muted hover:text-fg">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {msg && <p className="text-sm text-fg-muted">{msg}</p>}
        </div>
      </div>
    </Card>
  );
}
