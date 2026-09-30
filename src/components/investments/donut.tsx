"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL } from "@/lib/domain/format";
import { CHART_TOOLTIP_PROPS } from "@/components/ui/chart-theme";

export function InvestmentDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius={60} outerRadius={95} paddingAngle={2} dataKey="value" stroke="none">
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            formatter={(v, n) => [formatBRL(Number(v)), n]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
