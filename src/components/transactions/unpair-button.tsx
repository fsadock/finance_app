"use client";

import { useTransition } from "react";
import { ArrowLeftRight, Loader2, X } from "lucide-react";
import { unpairTransferAction } from "@/app/actions/transactions";

/** Transfer badge with an undo for wrong automatic pairings (e.g. salary matched to an unrelated Pix). */
export function TransferBadge({ txId }: { txId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <span className="group/badge inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-info/15 text-info">
      <ArrowLeftRight className="size-3" /> Transferência
      <button
        onClick={() => {
          if (!confirm("Desfazer o pareamento? As duas transações voltam para revisão e passam a contar no orçamento.")) return;
          startTransition(async () => {
            await unpairTransferAction(txId);
          });
        }}
        disabled={pending}
        className="opacity-0 group-hover/badge:opacity-100 hover:text-danger"
        title="Não é uma transferência"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
      </button>
    </span>
  );
}
