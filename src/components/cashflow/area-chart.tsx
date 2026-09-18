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

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
};

export function CashflowAreaChart({ data }: { data: { month: string; cumulative: number }[] }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d28d" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#00d28d" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS_PROPS} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} {...CHART_AXIS_PROPS} width={70} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v) => [formatBRLCompact(Number(v)), "Acumulado"]}
          />
          <Area type="monotone" dataKey="cumulative" stroke="#00d28d" strokeWidth={2} fill="url(#grad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
