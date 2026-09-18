"use client";

import { useState, useTransition } from "react";
import { Loader2, Pause, Pencil, Play, Trash2, Wand2 } from "lucide-react";
import { deleteRecurring, setRecurringActive, undoRecurringAutoChange } from "@/app/actions/recurrings";
import { CADENCE_LABEL, type AutoChangeRecord, type Cadence } from "@/lib/domain/recurrence";
import { formatBRL } from "@/lib/domain/format";
import { RecurringEditor, type CategoryOption, type RecurringFormValue } from "@/components/recurrings/recurring-editor";

export function RecurringActions({
  recurring,
  active,
  categories,
}: {
  recurring: RecurringFormValue;
  active: boolean;
  categories: CategoryOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const btn = "p-1 rounded text-fg-muted hover:bg-bg-hover disabled:opacity-50";
  const id = recurring.id;
  return (
    <span className="inline-flex items-center gap-0.5">
      {pending && <Loader2 className="size-3.5 animate-spin text-fg-muted" />}
      <button disabled={pending} onClick={() => setEditing(true)} className={`${btn} hover:text-fg`} title="Editar">
        <Pencil className="size-3.5" />
      </button>
      <button
        disabled={pending}
        onClick={() => startTransition(async () => void (await setRecurringActive(id, !active)))}
        className={`${btn} hover:text-fg`}
        title={active ? "Pausar (cancelada / não recorrente)" : "Reativar"}
      >
        {active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </button>
      <button
        disabled={pending}
        onClick={() => {
          if (!confirm("Excluir esta recorrência? As transações ficam, mas podem ser detectadas de novo na próxima sincronização. Para evitar isso, prefira pausar.")) return;
          startTransition(async () => void (await deleteRecurring(id)));
        }}
        className={`${btn} hover:text-danger`}
        title="Excluir"
      >
        <Trash2 className="size-3.5" />
      </button>
      {editing && <RecurringEditor recurring={recurring} categories={categories} onClose={() => setEditing(false)} />}
    </span>
  );
}

function describeChange(c: AutoChangeRecord) {
  const cadence = (x: string) => (CADENCE_LABEL[x as Cadence] ?? x).toLowerCase();
  if (c.reason === "cadence") {
    const months = Math.round(c.gapDays / 30.4);
    const gap = c.gapDays >= 45 ? `${months} meses` : `${c.gapDays} dias`;
    return {
      label: `agora ${cadence(c.to.cadence)}`,
      detail: `Atualizado automaticamente: era ${cadence(c.from.cadence)} de ${formatBRL(Math.abs(c.from.amount))}; as duas últimas cobranças tiveram ${gap} de intervalo, então passou a ${cadence(c.to.cadence)} de ${formatBRL(Math.abs(c.to.amount))}.`,
    };
  }
  return {
    label: `novo valor ${formatBRL(Math.abs(c.to.amount))}`,
    detail: `Atualizado automaticamente: as duas últimas cobranças foram de cerca de ${formatBRL(Math.abs(c.to.amount))} (antes ${formatBRL(Math.abs(c.from.amount))}).`,
  };
}

/** Badge for a change the app applied by itself after a sync, with an undo. */
export function AutoChangeBadge({ id, change }: { id: string; change: AutoChangeRecord }) {
  const [pending, startTransition] = useTransition();
  const { label, detail } = describeChange(change);
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info flex items-center gap-1" title={detail}>
      <Wand2 className="size-3" /> {label}
      <button
        disabled={pending}
        onClick={() => startTransition(async () => void (await undoRecurringAutoChange(id)))}
        className="ml-1 underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
        title="Voltar ao valor anterior; o app não aplica esta mudança de novo"
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : "desfazer"}
      </button>
    </span>
  );
}
