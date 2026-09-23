"use client";

import { useTransition } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import { setPassThrough } from "@/app/actions/transactions";

/**
 * Marks money that only passes through the account (a bill someone else funds), so it stops counting in
 * spending and budgets. The transaction stays in the list; the other side of the pair moves with it.
 */
export function PassThroughToggle({ txId, isPassThrough }: { txId: string; isPassThrough: boolean }) {
  const [pending, startTransition] = useTransition();
  const set = (value: boolean) => startTransition(async () => void (await setPassThrough(txId, value)));

  if (isPassThrough) {
    return (
      <span className="group/pt inline-flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-fg-subtle/15 text-fg-muted">
        <ArrowRightLeft className="size-3" /> Não conta
        <button onClick={() => set(false)} disabled={pending} className="opacity-0 group-hover/pt:opacity-100 hover:text-danger" title="Voltar a contar no orçamento">
          {pending ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={() => set(true)}
      disabled={pending}
      title="Não contar no orçamento: dinheiro que só passa pela conta (uma conta que alguém te manda o dinheiro para pagar)"
      className="shrink-0 text-fg-subtle opacity-0 transition-opacity hover:text-fg group-hover:opacity-100 md:opacity-0"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRightLeft className="size-3.5" />}
    </button>
  );
}
