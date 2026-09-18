import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { CashflowAreaChart } from "@/components/cashflow/area-chart";
import { CashflowSankey } from "@/components/cashflow/sankey";
import { getMonthlyCashflow, getSankeyData } from "@/lib/data/cashflow";
import { formatBRL, formatBRLCompact, formatMonthKeyLong } from "@/lib/domain/format";
import { PeriodPicker } from "@/components/period-picker";
import { formatPeriodLabel, parsePeriod } from "@/lib/domain/period";

type Props = { searchParams: Promise<{ month?: string }> };

export default async function CashflowPage({ searchParams }: Props) {
  const period = parsePeriod((await searchParams).month);
  const [data, sankey] = await Promise.all([getMonthlyCashflow(12, period.date), getSankeyData(period.date)]);
  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalSpend = data.reduce((s, d) => s + d.spend, 0);
  const avgNet = data.length > 0 ? (totalIncome - totalSpend) / data.length : 0;
  const monthsPositive = data.filter((d) => d.net > 0).length;

  const cumData = data.map((d, i) => ({
    month: d.month,
    cumulative: data.slice(0, i + 1).reduce((sum, x) => sum + x.net, 0),
  }));

  return (
    <>
      <PageHeader
        title="Fluxo de Caixa"
        subtitle={`Receitas vs despesas · 12 meses até ${formatPeriodLabel(period)} · estornos abatidos das despesas`}
        actions={<PeriodPicker />}
      />

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
          <CardTitle>Para onde foi o dinheiro · {formatPeriodLabel(period)}</CardTitle>
        </CardHeader>
        <CashflowSankey data={sankey} />
      </Card>

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
                  {formatMonthKeyLong(d.month)}
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
