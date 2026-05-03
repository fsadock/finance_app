"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Check, X, Loader2, CreditCard } from "lucide-react";
import { setCCMonthlyLimit, setCCCycleCloseDay } from "@/app/actions/accounts";
import { formatBRL } from "@/lib/format";

export function CCLimitEditor({
  current,
  currentSpend,
  remaining,
  dailyAllowance,
  isOverBudget,
  closeDay,
}: {
  current: number;
  currentSpend: number;
  remaining: number;
  dailyAllowance: number;
  isOverBudget: boolean;
  closeDay: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [limitValue, setLimitValue] = useState<string>(current > 0 ? String(current) : "");
  const [closeDayValue, setCloseDayValue] = useState<string>(closeDay ? String(closeDay) : "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const limitRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) limitRef.current?.focus();
  }, [editing]);

  function save() {
    setError(null);
    const num = parseFloat(limitValue.replace(",", "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError("Valor inválido");
      return;
    }
    const day = closeDayValue ? parseInt(closeDayValue) : null;
    if (closeDayValue && (!day || day < 1 || day > 28)) {
      setError("Dia inválido (1-28)");
      return;
    }
    startTransition(async () => {
      try {
        await setCCMonthlyLimit(num);
        await setCCCycleCloseDay(day);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
        <CreditCard className="size-3.5 text-fg-muted shrink-0" strokeWidth={1.75} />
        <span className="text-xs text-fg-muted">Meta:</span>
        <input
          ref={limitRef}
          type="text"
          inputMode="decimal"
          value={limitValue}
          onChange={(e) => setLimitValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          disabled={pending}
          className="w-24 bg-bg-elev border border-border rounded px-2 py-0.5 text-xs outline-none focus:border-accent"
          placeholder="4000"
        />
        <span className="text-xs text-fg-muted">Fechamento dia:</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={28}
          value={closeDayValue}
          onChange={(e) => setCloseDayValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          disabled={pending}
          className="w-14 bg-bg-elev border border-border rounded px-2 py-0.5 text-xs outline-none focus:border-accent"
          placeholder="13"
        />
        <button onClick={save} disabled={pending} className="p-0.5 text-accent hover:bg-bg-hover rounded">
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
        </button>
        <button onClick={() => setEditing(false)} disabled={pending} className="p-0.5 text-fg-muted hover:bg-bg-hover rounded">
          <X className="size-3" />
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }

  if (current <= 0) {
    return (
      <div className="mt-3 pt-3 border-t border-border">
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
        >
          <CreditCard className="size-3" />
          Definir meta mensal de cartões
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-fg-muted">
          <CreditCard className="size-3" strokeWidth={1.75} />
          <span>Cartão:</span>
        </div>
        <span className={isOverBudget ? "text-danger font-medium" : "text-fg"}>
          {formatBRL(currentSpend)} gastos
        </span>
        <span className="text-fg-muted">·</span>
        <span className={isOverBudget ? "text-danger" : "text-accent"}>
          {formatBRL(remaining)} restam
        </span>
        {dailyAllowance > 0 && (
          <>
            <span className="text-fg-muted">·</span>
            <span className="text-accent">{formatBRL(dailyAllowance)}/dia</span>
          </>
        )}
      </div>
      <button
        onClick={() => setEditing(true)}
        className="p-0.5 text-fg-subtle hover:text-fg-muted transition-colors"
        title={`Meta: ${formatBRL(current)}${closeDay ? ` · Fecha dia ${closeDay}` : ""}`}
      >
        <Pencil className="size-3" />
      </button>
    </div>
  );
}
