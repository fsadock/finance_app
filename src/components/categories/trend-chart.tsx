"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { formatBRLCompact } from "@/lib/domain/format";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_PROPS } from "@/components/ui/chart-theme";
import { cn } from "@/lib/utils";

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
};

type Mode = "line" | "stack";

const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: "line", label: "Trajetória", hint: "Como cada categoria se move ao longo dos meses" },
  { key: "stack", label: "Composição", hint: "Quanto as categorias somaram no mês e de que isso foi feito" },
];

/**
 * The same six months, read two ways.
 *
 * Lines follow one category across time and answer "isto está subindo?". They cannot answer "quanto custou
 * setembro?", because nothing in them adds up. Stacked, the bar is every category together and each band is
 * its share of that. Two questions, one set of numbers — so one card, not two.
 */
export function CategoriesTrendChart({
  data,
  categories,
}: {
  data: Record<string, number | string>[];
  categories: { name: string; color: string }[];
}) {
  const [mode, setMode] = useState<Mode>("line");
  const shared = (
    <>
      <CartesianGrid {...CHART_GRID_PROPS} />
      <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS_PROPS} />
      <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} {...CHART_AXIS_PROPS} width={70} />
      <Tooltip
        {...CHART_TOOLTIP_PROPS}
        labelFormatter={(l) => monthLabel(String(l))}
        formatter={(v) => formatBRLCompact(Number(v))}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap justify-end gap-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            title={m.hint}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              mode === m.key ? "bg-bg-elev text-fg" : "text-fg-muted hover:bg-bg-hover"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "line" ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              {shared}
              {categories.map((c) => (
                <Line
                  key={c.name}
                  type="monotone"
                  dataKey={c.name}
                  stroke={c.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              {shared}
              {categories.map((c, i) => (
                <Bar
                  key={c.name}
                  dataKey={c.name}
                  stackId="month"
                  fill={c.color}
                  // only the top band gets the rounded corner, or every slice looks detached
                  radius={i === categories.length - 1 ? [4, 4, 0, 0] : undefined}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
