"use client";

import { ResponsiveContainer, Sankey, Tooltip, Layer, Text } from "recharts";
import { formatBRLCompact } from "@/lib/format";

type Props = {
  data: {
    income: number;
    fixed: number;
    variable: { name: string; value: number }[];
    savings: number;
  };
};

export function CashflowSankey({ data }: Props) {
  const nodes = [
    { name: "Receita" }, // 0
    { name: "Contas Fixas" }, // 1
    { name: "Variável" }, // 2
    { name: "Economia" }, // 3
    ...data.variable.slice(0, 6).map((v) => ({ name: v.name })), // 4+
  ];

  const links = [
    { source: 0, target: 1, value: data.fixed },
    { source: 0, target: 2, value: data.variable.reduce((s, v) => s + v.value, 0) },
    { source: 0, target: 3, value: data.savings },
  ];

  data.variable.slice(0, 6).forEach((v, i) => {
    links.push({ source: 2, target: 4 + i, value: v.value });
  });

  // Filter out zero links to avoid Recharts errors
  const filteredLinks = links.filter((l) => l.value > 0);
  if (filteredLinks.length === 0 || data.income === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-fg-muted text-sm border border-dashed border-border rounded-xl">
        Sem dados de transações para o mês atual.
      </div>
    );
  }

  const CustomNode = (props: any) => {
    const { x, y, width, height, index, payload, containerWidth } = props;
    const isOut = x > containerWidth / 2;
    return (
      <Layer key={`node-${index}`}>
        <rect x={x} y={y} width={width} height={height} fill="#00d28d" fillOpacity={0.8} rx={2} />
        <Text
          x={isOut ? x - 6 : x + width + 6}
          y={y + height / 2}
          textAnchor={isOut ? "end" : "start"}
          verticalAnchor="middle"
          fontSize={12}
          fill="#9aa0a6"
        >
          {payload.name}
        </Text>
      </Layer>
    );
  };

  return (
    <div className="h-[450px] -mx-4">
      <ResponsiveContainer width="100%" height="100%">
        <Sankey
          data={{ nodes, links: filteredLinks }}
          node={<CustomNode />}
          link={{ stroke: "#00d28d", fillOpacity: 0.1 }}
          margin={{ top: 20, left: 10, bottom: 20, right: 110 }}
          nodePadding={40}
        >
          <Tooltip
            contentStyle={{
              background: "#15181d",
              border: "1px solid #232831",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(v) => formatBRLCompact(Number(v))}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}
