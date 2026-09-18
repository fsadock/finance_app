"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRLCompact } from "@/lib/domain/format";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from "@/components/ui/chart-theme";

type Row = { month: string; income: number; spend: number; net: number };

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short" });
};

export function CashflowChart({ data }: { data: Row[] }) {
  return (
    <div className="h-[280px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap={18}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS_PROPS} />
          <YAxis tickFormatter={(v) => formatBRLCompact(v)} {...CHART_AXIS_PROPS} width={70} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v, n) => [formatBRLCompact(Number(v)), n === "income" ? "Receita" : "Despesa"]}
          />
          <Bar dataKey="income" fill="#00d28d" radius={[6, 6, 0, 0]} />
          <Bar dataKey="spend" fill="#ff5d5d" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
