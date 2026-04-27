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
import { formatBRLCompact } from "@/lib/format";

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
          <CartesianGrid stroke="#232831" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickFormatter={(v) => formatBRLCompact(v)} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} width={70} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{
              background: "#15181d",
              border: "1px solid #232831",
              borderRadius: 12,
              fontSize: 12,
            }}
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
