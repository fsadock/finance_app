"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRLCompact } from "@/lib/domain/format";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from "@/components/ui/chart-theme";

type Row = {
  day: number;
  label?: string;
  actual: number | null;
  ideal: number | null;
  ccActual?: number | null;
  ccIdeal?: number | null;
};

const LABEL: Record<string, string> = {
  actual: "Gasto acumulado",
  ideal: "Meta orçamento",
  ccActual: "Cartão acumulado",
  ccIdeal: "Meta cartão",
};

export function SpendingPaceChart({ data, showCC = false }: { data: Row[]; showCC?: boolean }) {
  return (
    <div className="h-[280px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="label"
            {...CHART_AXIS_PROPS}
            interval={4}
          />
          <YAxis
            tickFormatter={(v) => formatBRLCompact(v)}
            {...CHART_AXIS_PROPS}
            width={70}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, n: any) => [
              formatBRLCompact(Number(v)),
              LABEL[String(n)] ?? String(n),
            ]}
            labelFormatter={(l) => String(l)}
          />
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="var(--color-fg-muted)"
            strokeDasharray="5 5"
            dot={false}
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#00d28d"
            dot={false}
            strokeWidth={3}
            connectNulls={false}
          />
          {showCC && (
            <Line
              type="monotone"
              dataKey="ccIdeal"
              stroke="#f97316"
              strokeDasharray="5 5"
              dot={false}
              strokeWidth={1}
            />
          )}
          {showCC && (
            <Line
              type="monotone"
              dataKey="ccActual"
              stroke="#f97316"
              dot={false}
              strokeWidth={2}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
