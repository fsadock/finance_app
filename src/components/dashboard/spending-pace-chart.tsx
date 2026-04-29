"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRLCompact } from "@/lib/format";

type Row = {
  day: number;
  actual: number | null;
  ideal: number;
  ccActual?: number | null;
  ccIdeal?: number;
};

const LABEL: Record<string, string> = {
  actual: "Gasto acumulado",
  ideal: "Meta orçamento",
  ccActual: "Cartão acumulado",
  ccIdeal: "Meta cartão",
};

export function SpendingPaceChart({ data, showCC = false }: { data: Row[]; showCC?: boolean }) {
  return (
    <div className="h-[280px] -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid stroke="#232831" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            stroke="#9aa0a6"
            tickLine={false}
            axisLine={false}
            fontSize={11}
            interval={4}
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any, n: any) => [
              formatBRLCompact(Number(v)),
              LABEL[String(n)] ?? String(n),
            ]}
            labelFormatter={(l) => `Dia ${l}`}
          />
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="#9aa0a6"
            strokeDasharray="5 5"
            dot={false}
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#00d28d"
            dot={false}
            strokeWidth={3}
            connectNulls={false}
          />
          {showCC && (
            <Line
              type="monotone"
              dataKey="ccIdeal"
              stroke="#f97316"
              strokeDasharray="5 5"
              dot={false}
              strokeWidth={1}
            />
          )}
          {showCC && (
            <Line
              type="monotone"
              dataKey="ccActual"
              stroke="#f97316"
              dot={false}
              strokeWidth={2}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
