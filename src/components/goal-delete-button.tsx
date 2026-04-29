"use client";

import { useTransition } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteGoal } from "@/app/actions/goals";

export function GoalDeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Excluir esta meta permanentemente?")) return;
    startTransition(async () => {
      await deleteGoal(id);
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={pending}
      className="p-1 rounded hover:bg-bg-hover text-fg-muted hover:text-danger transition-colors"
      title="Excluir meta"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}
