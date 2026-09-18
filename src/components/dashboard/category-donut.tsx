"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL } from "@/lib/domain/format";
import { CHART_TOOLTIP_STYLE } from "@/components/ui/chart-theme";

type Slice = { name: string; value: number; color: string };

export function CategoryDonut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="h-[180px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            innerRadius={55}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v, n) => [formatBRL(Number(v)), n]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div className="text-center">
          <div className="text-xs text-fg-muted">Total</div>
          <div className="font-semibold">{formatBRL(total)}</div>
        </div>
      </div>
    </div>
  );
}
