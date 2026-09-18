"use client";

import {
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
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from "@/components/ui/chart-theme";

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
};

export function CategoriesTrendChart({
  data,
  categories,
}: {
  data: Record<string, number | string>[];
  categories: { name: string; color: string }[];
}) {
  return (
    <div className="h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="month" tickFormatter={monthLabel} {...CHART_AXIS_PROPS} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} {...CHART_AXIS_PROPS} width={70} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v) => formatBRLCompact(Number(v))}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
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
      </ResponsiveContainer>
    </div>
  );
}
