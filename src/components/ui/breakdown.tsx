"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

/**
 * Makes a number answer "where does this come from?".
 *
 * Every screen shows totals, and a total is the one thing a person cannot check. Rather than a screen per
 * question, the number itself opens the rows behind it — and adds them up in front of the reader, so a
 * breakdown that does not reconcile says so instead of looking tidy.
 */
export function Breakdown({
  title,
  total,
  parts,
  children,
  description,
}: {
  title: string;
  total: number;
  /** `hint` is a second line under the label: where it came from, when it lands, whatever explains it. */
  parts: { id: string; label: string; value: number; hint?: string; href?: string }[];
  children: React.ReactNode;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  if (parts.length === 0) return <>{children}</>;

  const sum = parts.reduce((s, p) => s + p.value, 0);
  // Cents of rounding are not a discrepancy; anything a person would notice is.
  const missing = Math.abs(sum - total) >= 0.01 ? total - sum : 0;
  const ordered = [...parts].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver de onde vem este número"
        className="text-left decoration-dotted decoration-fg-subtle underline-offset-4 hover:underline"
      >
        {children}
      </button>
      {open && (
        <Dialog title={title} description={description} onClose={() => setOpen(false)}>
          <ul className="divide-y divide-border">
            {ordered.map((p) => {
              const row = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.label}</div>
                    {p.hint && <div className="truncate text-xs text-fg-muted">{p.hint}</div>}
                  </div>
                  <span className={cn("shrink-0 text-sm tabular-nums", p.value < 0 && "text-danger")}>
                    {formatBRL(p.value)}
                  </span>
                  {p.href && <ArrowRight className="size-3.5 shrink-0 text-fg-subtle" />}
                </>
              );
              return (
                <li key={p.id}>
                  {p.href ? (
                    <Link href={p.href} className="flex items-center gap-3 py-2.5 hover:text-accent">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm font-medium">
            <span>{parts.length} {parts.length === 1 ? "item" : "itens"}</span>
            <span className="tabular-nums">{formatBRL(sum)}</span>
          </div>
          {missing !== 0 && (
            <p className="mt-2 text-xs text-warn">
              Faltam {formatBRL(missing)} para os {formatBRL(total)} mostrados na tela — o detalhamento não
              cobre tudo que entra nesse total.
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
