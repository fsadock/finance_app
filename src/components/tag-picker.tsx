"use client";

import { useState, useTransition } from "react";
import { Plus, X, Hash } from "lucide-react";
import { addTransactionTag, removeTransactionTag } from "@/app/actions/transactions";
import { cn } from "@/lib/utils";

type Tag = { id: string; name: string; color: string | null };

export function TagPicker({
  txId,
  currentTags,
  allTags,
}: {
  txId: string;
  currentTags: Tag[];
  allTags: Tag[];
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  const handleAdd = (tagName: string) => {
    if (!tagName.trim()) return;
    startTransition(async () => {
      await addTransactionTag(txId, tagName);
      setValue("");
      setIsAdding(false);
    });
  };

  const handleRemove = (tagId: string) => {
    startTransition(async () => {
      await removeTransactionTag(txId, tagId);
    });
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {currentTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-bg-elev border border-border text-fg-muted"
        >
          <Hash className="size-2.5" />
          {tag.name}
          <button
            onClick={() => handleRemove(tag.id)}
            disabled={pending}
            className="hover:text-danger p-0.5 rounded-full hover:bg-bg-hover"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}

      {isAdding ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd(value);
              if (e.key === "Escape") setIsAdding(false);
            }}
            placeholder="Nova tag…"
            className="text-[10px] px-2 py-0.5 rounded-full bg-bg-elev border border-accent outline-none w-24"
          />
          <button
            onClick={() => handleAdd(value)}
            className="text-accent p-0.5 hover:bg-bg-hover rounded-full"
          >
            <Plus className="size-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="text-fg-subtle hover:text-fg p-0.5 rounded-full hover:bg-bg-hover border border-dashed border-border flex items-center gap-1 px-1.5 py-0.5 text-[10px]"
        >
          <Plus className="size-3" /> Tag
        </button>
      )}
    </div>
  );
}
