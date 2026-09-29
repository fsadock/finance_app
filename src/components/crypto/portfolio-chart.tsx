"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from "@/components/ui/chart-theme";
import { formatBRL, formatBRLCompact } from "@/lib/domain/format";

/** What the wallets were worth on each day the app took a snapshot. */
export function PortfolioChart({ data }: { data: { t: number; brl: number }[] }) {
  const day = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cryptoHistory" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis dataKey="t" tickFormatter={(v) => day.format(new Date(Number(v)))} minTickGap={40} {...CHART_AXIS_PROPS} />
          <YAxis tickFormatter={(v) => formatBRLCompact(Number(v))} width={70} {...CHART_AXIS_PROPS} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(v) => day.format(new Date(Number(v)))}
            formatter={(v) => [formatBRL(Number(v)), "Carteiras"]}
          />
          <Area type="monotone" dataKey="brl" stroke="var(--color-accent)" strokeWidth={2} fill="url(#cryptoHistory)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
