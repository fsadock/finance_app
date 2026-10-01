"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { setInstallmentsPaid } from "@/app/actions/installments";
import { formatBRL, formatDateNumeric } from "@/lib/domain/format";
import { errorMessage } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Installment = { number: number; date: Date; paid: boolean; byHand: boolean; received: boolean };

/**
 * Every instalment of a purchase, and what the app assumed about each one.
 *
 * The plan comes from the institution — how many instalments and from when — so the app projects all of
 * them whether or not each charge has been shared yet. Paying one off early is the one thing it cannot
 * know, so that is what this screen is for.
 */
export function InstallmentDialog({
  planKey,
  label,
  amount,
  installments,
  onClose,
}: {
  planKey: string;
  label: string;
  amount: number;
  installments: Installment[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = installments.filter((i) => !i.paid);

  function apply(numbers: number[], paid: boolean, marker: number | "all") {
    setBusy(marker);
    setError(null);
    startTransition(async () => {
      try {
        await setInstallmentsPaid({ planKey, numbers, paid });
        router.refresh();
      } catch (e) {
        setError(errorMessage(e, "Erro ao salvar"));
      } finally {
        setBusy(null);
      }
    });
  }

  const byHand = installments.filter((i) => i.byHand);

  return (
    <Dialog title={label} description={`${installments.length} parcelas de ${formatBRL(amount)}`} onClose={onClose}>
      <ul className="divide-y divide-border">
        {installments.map((i) => (
          <li key={i.number} className="flex items-center gap-3 py-2.5">
            <span className="w-10 shrink-0 text-sm tabular-nums text-fg-muted">{i.number}ª</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm">{formatDateNumeric(i.date)}</div>
              <div className="text-xs text-fg-muted">
                {i.byHand ? "você marcou como paga" : i.paid ? "cobrada" : "prevista"}
                {!i.received && " · projetada"}
              </div>
            </div>
            {i.paid && !i.byHand ? (
              <span className="shrink-0 text-xs text-fg-subtle">paga</span>
            ) : (
              <button
                onClick={() => apply([i.number], !i.byHand, i.number)}
                disabled={busy !== null || isPending}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs disabled:opacity-50",
                  i.byHand ? "border-accent/50 text-accent" : "border-border hover:border-accent hover:text-accent"
                )}
              >
                {busy === i.number ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                {i.byHand ? "Paga" : "Marcar paga"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <span className="text-xs text-fg-muted">
          {open.length > 0 ? `${open.length} em aberto · ${formatBRL(open.length * amount)}` : "Nada em aberto"}
        </span>
        {open.length > 0 ? (
          <Button size="sm" onClick={() => apply(open.map((i) => i.number), true, "all")} disabled={busy !== null || isPending}>
            {busy === "all" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Quitei esta compra
          </Button>
        ) : (
          byHand.length > 0 && (
            <button
              onClick={() => apply(byHand.map((i) => i.number), false, "all")}
              disabled={busy !== null || isPending}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Desfazer
            </button>
          )
        )}
      </div>
    </Dialog>
  );
}
