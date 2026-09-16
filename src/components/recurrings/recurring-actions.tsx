"use client";

import { useTransition } from "react";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { deleteRecurring, setRecurringActive } from "@/app/actions/recurrings";

export function RecurringActions({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const btn = "p-1 rounded text-fg-muted hover:bg-bg-hover disabled:opacity-50";
  return (
    <span className="inline-flex items-center gap-0.5">
      {pending && <Loader2 className="size-3.5 animate-spin text-fg-muted" />}
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
    </span>
  );
}
