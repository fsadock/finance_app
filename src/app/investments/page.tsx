import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { InvestmentDonut } from "@/components/investments/donut";
import { ProjectionChart } from "@/components/investments/projection";

const TYPE_COLOR: Record<string, string> = {
  STOCK: "#06b6d4",
  ETF: "#3b82f6",
  FIXED_INCOME: "#22c55e",
  CRYPTO: "#f59e0b",
  FUND: "#a855f7",
  OTHER: "#6b7280",
};

const TYPE_LABEL: Record<string, string> = {
  STOCK: "Ações",
  ETF: "ETFs",
  FIXED_INCOME: "Renda fixa",
  CRYPTO: "Cripto",
  FUND: "Fundos",
  OTHER: "Outros",
};

export default async function InvestmentsPage() {
  const investments = await prisma.investment.findMany({ include: { account: true } });

  const total = investments.reduce((s, i) => s + i.currentPrice * i.quantity, 0);
  const totalCost = investments.reduce((s, i) => s + i.costBasis * i.quantity, 0);
  const pnl = total - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  const byType = new Map<string, number>();
  for (const i of investments) {
    const v = i.currentPrice * i.quantity;
    byType.set(i.type, (byType.get(i.type) ?? 0) + v);
  }
  const allocation = Array.from(byType.entries()).map(([type, value]) => ({
    name: TYPE_LABEL[type] ?? type,
    value,
    color: TYPE_COLOR[type] ?? "#6b7280",
  }));

  // Projection: monthly contribution + 0.8% mo (~10% yr) for 10 years
  const monthlyContribution = 1000;
  const monthlyRate = 0.008;
  const projection: { month: number; conservative: number; expected: number; aggressive: number }[] = [];
  for (let m = 0; m <= 120; m++) {
    const fv = (rate: number) => total * Math.pow(1 + rate, m) + monthlyContribution * ((Math.pow(1 + rate, m) - 1) / rate);
    projection.push({
      month: m,
      conservative: fv(0.005),
      expected: fv(monthlyRate),
      aggressive: fv(0.012),
    });
  }

  return (
    <>
      <PageHeader title="Investimentos" subtitle="Patrimônio investido e projeções" />

      <div className="grid grid-cols-12 gap-4 mb-4">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Total investido</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(total)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">Custo: {formatBRLCompact(totalCost)}</div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Lucro/Prejuízo</CardTitle>
          </CardHeader>
          <CardValue className={pnl >= 0 ? "text-accent" : "text-danger"}>{formatBRL(pnl)}</CardValue>
          <div className={`text-xs mt-3 ${pnl >= 0 ? "text-accent" : "text-danger"}`}>
            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
          </div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Posições</CardTitle>
          </CardHeader>
          <CardValue>{investments.length}</CardValue>
          <div className="text-xs text-fg-muted mt-3">{allocation.length} classes de ativos</div>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4 mb-4">
        <Card className="col-span-12 lg:col-span-5">
          <CardHeader>
            <CardTitle>Diversificação</CardTitle>
          </CardHeader>
          <InvestmentDonut data={allocation} />
          <ul className="mt-4 space-y-2">
            {allocation.sort((a, b) => b.value - a.value).map((a) => (
              <li key={a.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </span>
                <span className="text-fg-muted">
                  {formatBRLCompact(a.value)} · {Math.round((a.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader>
            <CardTitle>Projeção 10 anos · aporte R$ 1.000/mês</CardTitle>
            <span className="text-xs text-fg-muted">cenários: 6%, 10%, 15% a.a.</span>
          </CardHeader>
          <ProjectionChart data={projection} />
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-b border-border">
              <th className="px-6 py-3 font-medium">Ativo</th>
              <th className="px-6 py-3 font-medium">Tipo</th>
              <th className="px-6 py-3 font-medium">Conta</th>
              <th className="px-6 py-3 font-medium text-right">Qtd</th>
              <th className="px-6 py-3 font-medium text-right">Preço</th>
              <th className="px-6 py-3 font-medium text-right">Custo</th>
              <th className="px-6 py-3 font-medium text-right">Posição</th>
              <th className="px-6 py-3 font-medium text-right">P&L</th>
            </tr>
          </thead>
          <tbody>
            {investments.map((i) => {
              const value = i.currentPrice * i.quantity;
              const cost = i.costBasis * i.quantity;
              const p = value - cost;
              const pp = cost > 0 ? (p / cost) * 100 : 0;
              return (
                <tr key={i.id} className="border-b border-border last:border-b-0 hover:bg-bg-hover/40">
                  <td className="px-6 py-3">
                    <div className="font-medium">{i.name}</div>
                    {i.ticker && <div className="text-xs text-fg-muted">{i.ticker}</div>}
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: `${TYPE_COLOR[i.type]}20`, color: TYPE_COLOR[i.type] }}>
                      {TYPE_LABEL[i.type]}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-fg-muted">{i.account.name}</td>
                  <td className="px-6 py-3 text-right">{i.quantity}</td>
                  <td className="px-6 py-3 text-right">{formatBRL(i.currentPrice)}</td>
                  <td className="px-6 py-3 text-right text-fg-muted">{formatBRL(cost)}</td>
                  <td className="px-6 py-3 text-right font-medium">{formatBRL(value)}</td>
                  <td className={`px-6 py-3 text-right ${p >= 0 ? "text-accent" : "text-danger"}`}>
                    {p >= 0 ? "+" : ""}{pp.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
