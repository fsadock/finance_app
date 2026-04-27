import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { CashflowAreaChart } from "@/components/cashflow/area-chart";
import { getMonthlyCashflow } from "@/lib/queries";
import { formatBRL, formatBRLCompact } from "@/lib/format";

export default async function CashflowPage() {
  const data = await getMonthlyCashflow(12);
  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalSpend = data.reduce((s, d) => s + d.spend, 0);
  const avgNet = data.length > 0 ? (totalIncome - totalSpend) / data.length : 0;
  const monthsPositive = data.filter((d) => d.net > 0).length;

  let cumulative = 0;
  const cumData = data.map((d) => {
    cumulative += d.net;
    return { month: d.month, cumulative };
  });

  return (
    <>
      <PageHeader title="Fluxo de Caixa" subtitle="Receitas vs despesas · 12 meses" />

      <div className="grid grid-cols-12 gap-4 mb-4">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Receita total (12m)</CardTitle>
          </CardHeader>
          <CardValue className="text-accent">{formatBRL(totalIncome)}</CardValue>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Despesa total (12m)</CardTitle>
          </CardHeader>
          <CardValue className="text-danger">{formatBRL(totalSpend)}</CardValue>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Saldo médio mensal</CardTitle>
          </CardHeader>
          <CardValue className={avgNet >= 0 ? "text-accent" : "text-danger"}>
            {formatBRLCompact(avgNet)}
          </CardValue>
          <div className="text-xs text-fg-muted mt-3">
            {monthsPositive} de {data.length} meses positivos
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Receitas e despesas por mês</CardTitle>
        </CardHeader>
        <CashflowChart data={data} />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo acumulado</CardTitle>
        </CardHeader>
        <CashflowAreaChart data={cumData} />
      </Card>

      <Card className="mt-4 p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted border-b border-border">
              <th className="px-6 py-3 font-medium">Mês</th>
              <th className="px-6 py-3 font-medium text-right">Receita</th>
              <th className="px-6 py-3 font-medium text-right">Despesa</th>
              <th className="px-6 py-3 font-medium text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.month} className="border-b border-border last:border-b-0 hover:bg-bg-hover/40">
                <td className="px-6 py-3 capitalize">
                  {new Date(`${d.month}-01`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </td>
                <td className="px-6 py-3 text-right text-accent">{formatBRL(d.income)}</td>
                <td className="px-6 py-3 text-right text-danger">{formatBRL(d.spend)}</td>
                <td className={`px-6 py-3 text-right font-medium ${d.net >= 0 ? "text-accent" : "text-danger"}`}>
                  {formatBRL(d.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
