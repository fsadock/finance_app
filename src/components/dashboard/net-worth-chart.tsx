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

type Row = { month: string; value: number };

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  const d = new Date(Number(y), Number(mm) - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short" });
};

export function NetWorthChart({ data }: { data: Row[] }) {
  return (
    <div className="h-[300px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.1} />
              <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232831" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={monthLabel}
            stroke="#9aa0a6"
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <YAxis
            tickFormatter={(v) => formatBRLCompact(v)}
            stroke="#9aa0a6"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: "#15181d",
              border: "1px solid #232831",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v) => [formatBRLCompact(Number(v)), "Patrimônio"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-accent)"
            fillOpacity={1}
            fill="url(#colorValue)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
