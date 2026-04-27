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
import { formatBRLCompact } from "@/lib/format";

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
          <CartesianGrid stroke="#232831" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} width={70} />
          <Tooltip
            contentStyle={{ background: "#15181d", border: "1px solid #232831", borderRadius: 12, fontSize: 12 }}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v) => [formatBRLCompact(Number(v)), "Acumulado"]}
          />
          <Area type="monotone" dataKey="cumulative" stroke="#00d28d" strokeWidth={2} fill="url(#grad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
