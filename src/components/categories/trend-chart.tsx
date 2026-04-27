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
import { formatBRLCompact } from "@/lib/format";

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
          <CartesianGrid stroke="#232831" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} stroke="#9aa0a6" tickLine={false} axisLine={false} fontSize={11} width={70} />
          <Tooltip
            contentStyle={{
              background: "#15181d",
              border: "1px solid #232831",
              borderRadius: 12,
              fontSize: 12,
            }}
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
