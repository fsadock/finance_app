"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRLCompact } from "@/lib/domain/format";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from "@/components/ui/chart-theme";

type Row = { month: string; value: number };

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short" });
};

export function NetWorthChart({ data }: { data: Row[] }) {
  return (
    <div className="h-[300px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.1} />
              <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            {...CHART_AXIS_PROPS}
          />
          <YAxis
            tickFormatter={(v) => formatBRLCompact(v)}
            {...CHART_AXIS_PROPS}
            width={70}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v) => [formatBRLCompact(Number(v)), "Patrimônio"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            fillOpacity={1}
            fill="url(#colorValue)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
