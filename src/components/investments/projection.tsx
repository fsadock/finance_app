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

type Row = { month: number; conservative: number; expected: number; aggressive: number };

export function ProjectionChart({ data }: { data: Row[] }) {
  const yearTick = (m: number) => (m % 12 === 0 ? `${m / 12}a` : "");
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="agg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d28d" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#00d28d" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4d8bf5" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#4d8bf5" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cons" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9aa0a6" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#9aa0a6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#232831" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(v) => yearTick(Number(v))} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} interval={11} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} width={70} />
          <Tooltip
            contentStyle={{ background: "#15181d", border: "1px solid #232831", borderRadius: 12, fontSize: 12 }}
            labelFormatter={(l) => `Mês ${l}`}
            formatter={(v, n) => [formatBRLCompact(Number(v)), n === "conservative" ? "6% a.a." : n === "expected" ? "10% a.a." : "15% a.a."]}
          />
          <Area type="monotone" dataKey="aggressive" stroke="#00d28d" strokeWidth={2} fill="url(#agg)" />
          <Area type="monotone" dataKey="expected" stroke="#4d8bf5" strokeWidth={2} fill="url(#exp)" />
          <Area type="monotone" dataKey="conservative" stroke="#9aa0a6" strokeWidth={2} fill="url(#cons)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
