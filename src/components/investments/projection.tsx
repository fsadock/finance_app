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

type Row = { month: number; conservative: number; expected: number; aggressive: number };

type ProjectionLabels = { conservative: string; expected: string; aggressive: string };

export function ProjectionChart({ data, labels }: { data: Row[]; labels: ProjectionLabels }) {
  const yearTick = (m: number) => (m % 12 === 0 ? `${m / 12}a` : "");
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="agg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d28d" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#00d28d" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4d8bf5" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#4d8bf5" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cons" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-fg-muted)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--color-fg-muted)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" tickFormatter={(v) => yearTick(Number(v))} {...CHART_AXIS_PROPS} interval={11} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} {...CHART_AXIS_PROPS} width={70} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(l) => `Mês ${l}`}
            formatter={(v, n) => [formatBRLCompact(Number(v)), labels[n as keyof ProjectionLabels] ?? String(n)]}
          />
          <Area type="monotone" dataKey="aggressive" stroke="#00d28d" strokeWidth={2} fill="url(#agg)" />
          <Area type="monotone" dataKey="expected" stroke="#4d8bf5" strokeWidth={2} fill="url(#exp)" />
          <Area type="monotone" dataKey="conservative" stroke="var(--color-fg-muted)" strokeWidth={2} fill="url(#cons)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
