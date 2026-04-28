"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { createCategory } from "@/app/actions/transactions";

const COLORS = [
  "#22c55e", "#10b981", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899",
  "#f97316", "#eab308", "#84cc16", "#ef4444", "#f43f5e", "#64748b",
];

export function CategoryCreateDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const [error, setError] = useState<string | null>(null);
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createCategory({ name, group, color });
        setName("");
        setGroup("");
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro");
      }
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elev border border-border hover:border-accent hover:text-accent text-sm"
      >
        <Plus className="size-3.5" /> Nova categoria
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="absolute right-0 top-full mt-2 w-72 z-50 rounded-xl border border-border bg-bg-card p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Nova categoria</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-fg-muted hover:text-fg">
              <X className="size-4" />
            </button>
          </div>
          <label className="block text-xs text-fg-muted mb-1">Nome</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="ex: Cuidados pessoais"
            className="w-full mb-3 bg-bg-elev border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <label className="block text-xs text-fg-muted mb-1">Grupo</label>
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            placeholder="ex: Personalizadas"
            className="w-full mb-3 bg-bg-elev border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <label className="block text-xs text-fg-muted mb-2">Cor</label>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-6 rounded-full border-2 ${color === c ? "border-fg" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          {error && <div className="text-xs text-danger mb-2">{error}</div>}
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent text-bg font-medium rounded-lg py-2 text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Criar
          </button>
        </form>
      )}
    </div>
  );
}
