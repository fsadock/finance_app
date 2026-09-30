"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { formatBRL } from "@/lib/domain/format";
import { ListRow, MobileList } from "@/components/ui/list-row";
import { cn } from "@/lib/utils";

export type Position = {
  id: string;
  name: string;
  ticker: string | null;
  type: string;
  typeLabel: string;
  typeColor: string;
  account: string;
  quantity: number;
  price: number;
  cost: number;
  value: number;
  pnl: number;
  pnlPct: number;
};

type Column = { key: keyof Position; label: string; align?: "right"; format?: (p: Position) => string };

const COLUMNS: Column[] = [
  { key: "name", label: "Ativo" },
  { key: "typeLabel", label: "Tipo" },
  { key: "account", label: "Conta" },
  { key: "quantity", label: "Qtd", align: "right", format: (p) => p.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 8 }) },
  { key: "price", label: "Preço", align: "right", format: (p) => formatBRL(p.price) },
  { key: "cost", label: "Custo", align: "right", format: (p) => formatBRL(p.cost) },
  { key: "value", label: "Posição", align: "right", format: (p) => formatBRL(p.value) },
  { key: "pnlPct", label: "P&L", align: "right" },
];

/**
 * The positions, sortable by any column and filtered by type, name or "only what has value" — a portfolio of
 * fixed income ends up with many settled rows worth zero, and they bury the ones that matter.
 */
export function PositionsTable({ positions }: { positions: Position[] }) {
  const [sort, setSort] = useState<{ key: keyof Position; desc: boolean }>({ key: "value", desc: true });
  const [type, setType] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(positions.some((p) => p.value === 0));

  const types = useMemo(
    () => [...new Map(positions.map((p) => [p.type, { label: p.typeLabel, color: p.typeColor }])).entries()],
    [positions]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = positions.filter(
      (p) =>
        (!type || p.type === type) &&
        (!hideEmpty || p.value !== 0) &&
        (!term || `${p.name} ${p.ticker ?? ""} ${p.account}`.toLowerCase().includes(term))
    );
    return [...filtered].sort((a, b) => {
      const [x, y] = [a[sort.key], b[sort.key]];
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
      return sort.desc ? -cmp : cmp;
    });
  }, [positions, sort, type, search, hideEmpty]);

  const toggleSort = (key: keyof Position) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: typeof positions[0]?.[key] === "number" }));

  const hidden = positions.length - rows.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <label className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ativo ou conta…"
            className="w-full rounded-lg border border-border bg-bg-elev py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
          />
        </label>
        {types.length > 1 &&
          types.map(([key, { label, color }]) => (
            <button
              key={key}
              onClick={() => setType((t) => (t === key ? null : key))}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                type === key ? "text-bg" : "text-fg-muted hover:bg-bg-hover"
              )}
              style={type === key ? { background: color } : { background: `${color}20`, color }}
            >
              {label}
            </button>
          ))}
        <button
          onClick={() => setHideEmpty((v) => !v)}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
            hideEmpty ? "border-accent/50 text-accent" : "border-border text-fg-muted hover:bg-bg-hover"
          )}
        >
          Esconder zeradas
        </button>
      </div>

      <div className="hidden overflow-x-auto md:block">
        {/* larguras fixas: com nomes de CDB gigantes, deixar o navegador decidir estoura a tabela */}
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-muted">
              {COLUMNS.map((c) => (
                <th key={c.key} className={cn("px-3 py-3 font-medium first:pl-6 last:pr-6", c.align === "right" && "text-right")}>
                  <button
                    onClick={() => toggleSort(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-fg",
                      c.align === "right" && "flex-row-reverse",
                      sort.key === c.key && "text-fg"
                    )}
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-bg-hover/40">
                <td className="py-3 pl-6 pr-3">
                  <div className="line-clamp-2 font-medium" title={p.name}>
                    {p.name}
                  </div>
                  {p.ticker && <div className="text-xs text-fg-muted">{p.ticker}</div>}
                </td>
                <td className="px-3 py-3">
                  <span className="whitespace-nowrap rounded-md px-2 py-0.5 text-xs" style={{ background: `${p.typeColor}20`, color: p.typeColor }}>
                    {p.typeLabel}
                  </span>
                </td>
                <td className="px-3 py-3 text-fg-muted">
                  <div className="truncate" title={p.account}>
                    {p.account}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{COLUMNS[3]!.format!(p)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{formatBRL(p.price)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-fg-muted tabular-nums">{formatBRL(p.cost)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">{formatBRL(p.value)}</td>
                <td className={cn("whitespace-nowrap py-3 pl-3 pr-6 text-right tabular-nums", p.pnl >= 0 ? "text-accent" : "text-danger")}>
                  {p.pnl >= 0 ? "+" : ""}
                  {p.pnlPct.toFixed(1)}%
                  <div className="text-xs text-fg-subtle">{formatBRL(p.pnl)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MobileList>
        {rows.map((p) => (
          <ListRow
            key={p.id}
            title={
              <>
                <span className="truncate font-medium">{p.name}</span>
                <span
                  className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px]"
                  style={{ background: `${p.typeColor}20`, color: p.typeColor }}
                >
                  {p.typeLabel}
                </span>
              </>
            }
            meta={
              <>
                <span className="tabular-nums">{COLUMNS[3]!.format!(p)}</span>
                <span>× {formatBRL(p.price)}</span>
                <span className="truncate">{p.account}</span>
              </>
            }
            value={
              <>
                {formatBRL(p.value)}
                <div className={cn("text-xs", p.pnl >= 0 ? "text-accent" : "text-danger")}>
                  {p.pnl >= 0 ? "+" : ""}
                  {p.pnlPct.toFixed(1)}%
                </div>
              </>
            }
          />
        ))}
      </MobileList>

      {rows.length === 0 && <p className="p-8 text-center text-sm text-fg-muted">Nada com esses filtros.</p>}
      {hidden > 0 && rows.length > 0 && (
        <p className="border-t border-border px-6 py-2 text-xs text-fg-subtle">
          {hidden} posição(ões) fora dos filtros
        </p>
      )}
    </div>
  );
}
