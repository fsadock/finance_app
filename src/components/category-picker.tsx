"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, X, AlertCircle, Loader2, Search } from "lucide-react";
import { setTransactionCategory } from "@/app/actions/transactions";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; color: string | null; group: string | null };

export function CategoryPicker({
  txId,
  currentCategoryId,
  currentCategoryName,
  currentCategoryColor,
  categories,
  needsReview,
}: {
  txId: string;
  currentCategoryId: string | null;
  currentCategoryName: string | null;
  currentCategoryColor: string | null;
  categories: Category[];
  needsReview: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function pick(catId: string | null) {
    startTransition(async () => {
      await setTransactionCategory(txId, catId);
      setOpen(false);
      setQuery("");
    });
  }

  const filtered = query
    ? categories.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : categories;

  // Group categories
  const groups = new Map<string, Category[]>();
  for (const c of filtered) {
    const g = c.group ?? "Outros";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-2 py-1 -ml-2 transition-colors hover:bg-bg-hover",
          pending && "opacity-50"
        )}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin text-fg-muted" />
        ) : currentCategoryId ? (
          <span className="size-2 rounded-full" style={{ background: currentCategoryColor ?? "#6b7280" }} />
        ) : needsReview ? (
          <AlertCircle className="size-4 text-warn" />
        ) : null}
        <span className={currentCategoryId ? "" : "italic text-fg-muted"}>
          {currentCategoryName ?? "Sem categoria"}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 rounded-xl border border-border bg-bg-card shadow-2xl overflow-hidden">
          <div className="relative border-b border-border">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              autoFocus
              placeholder="Buscar categoria…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent pl-9 pr-3 py-2 text-sm outline-none"
            />
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {currentCategoryId && (
              <button
                onClick={() => pick(null)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-fg-muted hover:bg-bg-hover"
              >
                <X className="size-3.5" /> Remover categoria
              </button>
            )}
            {Array.from(groups.entries()).map(([group, cats]) => (
              <div key={group}>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-fg-subtle">{group}</div>
                {cats.map((c) => {
                  const selected = c.id === currentCategoryId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => pick(c.id)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-bg-hover",
                        selected && "bg-bg-hover"
                      )}
                    >
                      <span className="size-2.5 rounded-full shrink-0" style={{ background: c.color ?? "#6b7280" }} />
                      <span className="flex-1 text-left">{c.name}</span>
                      {selected && <Check className="size-3.5 text-accent" />}
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-sm text-fg-muted text-center">Nenhuma categoria encontrada.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
