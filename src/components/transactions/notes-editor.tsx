"use client";

import { useState, useTransition } from "react";
import { StickyNote } from "lucide-react";
import { setTransactionNotes } from "@/app/actions/transactions";

export function NotesEditor({ txId, notes }: { txId: string; notes: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await setTransactionNotes(txId, value);
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={pending}
        maxLength={500}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(notes ?? "");
            setEditing(false);
          }
        }}
        placeholder="Anotação…"
        className="mt-1 w-full max-w-sm text-xs px-2 py-1 rounded bg-bg-elev border border-accent outline-none"
      />
    );
  }
  return notes ? (
    <button onClick={() => setEditing(true)} className="mt-1 flex items-center gap-1 text-xs text-fg-muted hover:text-fg text-left">
      <StickyNote className="size-3 shrink-0" /> {notes}
    </button>
  ) : (
    <button
      onClick={() => setEditing(true)}
      className="mt-1 text-[10px] text-fg-subtle hover:text-fg opacity-0 group-hover:opacity-100 flex items-center gap-1"
    >
      <StickyNote className="size-3" /> Nota
    </button>
  );
}
