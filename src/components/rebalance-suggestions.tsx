"use client";

import { useState, useTransition } from "react";
import { Sparkles, ArrowRight, Check, Loader2 } from "lucide-react";
import { applyRebalance } from "@/app/actions/budgets";
import { formatBRL } from "@/lib/format";
import { Card } from "./ui/card";

type Suggestion = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

export function RebalanceSuggestions({
  monthStr,
  suggestions,
}: {
  monthStr: string;
  suggestions: Suggestion[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (suggestions.length === 0) return null;

  async function handleApply() {
    startTransition(async () => {
      await applyRebalance(monthStr, suggestions);
      setIsOpen(false);
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors text-sm font-medium"
      >
        <Sparkles className="size-4" />
        Ajuste inteligente ({suggestions.length})
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 z-50 animate-in fade-in slide-in-from-top-2">
          <Card className="p-4 shadow-2xl border-accent/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-accent" /> Sugestões
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-xs text-fg-muted hover:text-fg"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-1">
              {suggestions.map((s, i) => (
                <div key={i} className="text-xs bg-bg-elev p-2 rounded-lg border border-border">
                  <div className="flex items-center justify-between mb-1 text-fg-muted">
                    <span>{s.fromName}</span>
                    <ArrowRight className="size-3" />
                    <span className="text-fg">{s.toName}</span>
                  </div>
                  <div className="font-medium text-accent">{formatBRL(s.amount)}</div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-fg-muted mb-4">
              Movemos o que sobrou de categorias economizadas para cobrir os excessos deste mês.
            </p>

            <button
              onClick={handleApply}
              disabled={pending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-bg font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  <Check className="size-4" /> Aplicar todos
                </>
              )}
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}
