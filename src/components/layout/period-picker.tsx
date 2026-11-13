"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { parsePeriod, shiftPeriod, formatPeriodLabel } from "@/lib/domain/period";
import { monthKey } from "@/lib/domain/format";

const MONTHS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

export function PeriodPicker({ minYear }: { minYear?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const period = parsePeriod(sp.get("month"));
  const now = new Date();
  const maxY = now.getFullYear();
  const minY = minYear ?? maxY - 5;

  function navigate(newKey: string) {
    const params = new URLSearchParams(sp);
    params.set("month", newKey);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-1 bg-bg-elev border border-border rounded-lg p-1">
      <button
        onClick={() => navigate(shiftPeriod(period, -1).key)}
        className="size-7 grid place-items-center rounded hover:bg-bg-hover text-fg-muted hover:text-fg"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="size-4" />
      </button>
      <select
        value={period.month}
        onChange={(e) => navigate(monthKey(new Date(period.year, Number(e.target.value) - 1, 1)))}
        className="bg-transparent text-sm px-2 py-1 outline-none cursor-pointer"
      >
        {MONTHS.map((m, i) => (
          <option key={m} value={i + 1} className="bg-bg-elev">{m}</option>
        ))}
      </select>
      <select
        value={period.year}
        onChange={(e) => navigate(monthKey(new Date(Number(e.target.value), period.month - 1, 1)))}
        className="bg-transparent text-sm px-2 py-1 outline-none cursor-pointer"
      >
        {Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i).map((y) => (
          <option key={y} value={y} className="bg-bg-elev">{y}</option>
        ))}
      </select>
      <button
        onClick={() => navigate(shiftPeriod(period, 1).key)}
        className="size-7 grid place-items-center rounded hover:bg-bg-hover text-fg-muted hover:text-fg"
        aria-label="Próximo mês"
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        onClick={() => navigate(monthKey(now))}
        className="text-xs px-2 py-1 rounded hover:bg-bg-hover text-fg-muted hover:text-fg"
      >
        Hoje
      </button>
      <span className="sr-only">{formatPeriodLabel(period)}</span>
    </div>
  );
}
