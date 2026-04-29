"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Check, X, Loader2, Trash2, RefreshCcw } from "lucide-react";
import { setBudget, deleteBudget, toggleRollover } from "@/app/actions/budgets";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BudgetEditor({
  categoryId,
  startMonth,
  current,
  rolloverEnabled,
}: {
  categoryId: string;
  startMonth: string;
  current: number;
  rolloverEnabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(current > 0 ? String(current) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setValue(current > 0 ? String(current) : "");
  }, [editing, current]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    setError(null);
    const num = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      setError("Valor inválido");
      return;
    }
    startTransition(async () => {
      try {
        await setBudget({ categoryId, monthlyLimit: num, startMonth });
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  function handleToggleRollover() {
    startTransition(async () => {
      try {
        await toggleRollover(categoryId, !rolloverEnabled);
      } catch (e) {
        console.error(e);
      }
    });
  }

  function remove() {
    if (!confirm("Remover orçamento desta categoria?")) return;
    startTransition(async () => {
      try {
        await deleteBudget({ categoryId, startMonth });
        setValue("");
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggleRollover}
          className={cn(
            "p-1 rounded transition-colors",
            rolloverEnabled ? "bg-accent/10 text-accent" : "text-fg-muted hover:bg-bg-hover"
          )}
          title={rolloverEnabled ? "Rollover ativado" : "Ativar rollover"}
        >
          <RefreshCcw className={cn("size-3.5", pending && "animate-spin")} />
        </button>
        <button
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg group"
        >
          {current > 0 ? (
            <>de {formatBRL(current)}</>
          ) : (
            <span className="italic">Definir orçamento</span>
          )}
          <Pencil className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-fg-muted">R$</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={pending}
        className="w-24 bg-bg-elev border border-border rounded px-2 py-1 text-sm outline-none focus:border-accent"
        placeholder="0,00"
      />
      <button
        onClick={save}
        disabled={pending}
        className="p-1 rounded hover:bg-bg-hover text-accent"
        title="Salvar"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      </button>
      <button
        onClick={() => setEditing(false)}
        disabled={pending}
        className="p-1 rounded hover:bg-bg-hover text-fg-muted"
        title="Cancelar"
      >
        <X className="size-3.5" />
      </button>
      {current > 0 && (
        <button
          onClick={remove}
          disabled={pending}
          className="p-1 rounded hover:bg-bg-hover text-danger"
          title="Remover"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
      {error && <span className="text-xs text-danger ml-1">{error}</span>}
    </div>
  );
}
