"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBRL } from "@/lib/format";

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
            contentStyle={{ background: "#15181d", border: "1px solid #232831", borderRadius: 12, fontSize: 12 }}
            formatter={(v, n) => [formatBRL(Number(v)), n]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
