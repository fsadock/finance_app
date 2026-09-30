import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import { getInvestments } from "@/lib/data/investments";
import { formatBRL, formatBRLCompact, formatDayMonth, startOfDay } from "@/lib/domain/format";
import { InvestmentDonut } from "@/components/investments/donut";
import { ProjectionChart } from "@/components/investments/projection";
import { PositionsTable, type Position } from "@/components/investments/positions-table";
import { getBenchmarkRates } from "@/lib/data/rates";
import { futureValue, grossUp, realRate } from "@/lib/domain/investments";
import { parseBRLInput } from "@/lib/domain/brazil";
import Link from "next/link";
import { getCryptoSummary } from "@/lib/data/crypto";
import { formatUSD } from "@/lib/domain/format";

/** Used only when the BCB API is unreachable. */
const FALLBACK = { cdi: 0.1, ipca: 0.045 };
const pct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;

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

type Props = { searchParams: Promise<{ aporte?: string }> };

export default async function InvestmentsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [investments, rates, crypto] = await Promise.all([
    getInvestments(),
    getBenchmarkRates(),
    getCryptoSummary(),
  ]);

  const positions: Position[] = investments.map((i) => {
    const value = i.currentPrice * i.quantity;
    const cost = i.costBasis * i.quantity;
    const pnl = value - cost;
    return {
      id: i.id,
      name: i.name,
      ticker: i.ticker,
      type: i.type,
      typeLabel: TYPE_LABEL[i.type] ?? i.type,
      typeColor: TYPE_COLOR[i.type] ?? "#6b7280",
      account: i.account.name,
      quantity: i.quantity,
      price: i.currentPrice,
      cost,
      value,
      pnl,
      pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
    };
  });

  const totalCost = investments.reduce((s, i) => s + i.costBasis * i.quantity, 0);
  // Fixed income arrives net of tax, so the profit shown here is the net one too; `withheld` is what the
  // bank's own app still counts as yours, and the difference between the two screens.
  const { net: total, withheld } = grossUp(
    investments.map((i) => ({ value: i.currentPrice * i.quantity, incomeTax: i.incomeTax, iof: i.iof }))
  );
  const pnl = total - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  // Open Finance delivers investments with a lag; say so instead of implying the numbers are from now.
  const oldest = investments.reduce<Date | null>((min, i) => (!min || i.asOf < min ? i.asOf : min), null);
  const stale = oldest && startOfDay(oldest) < startOfDay(new Date()) ? oldest : null;

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

  // Projection with real Brazilian benchmarks
  const monthlyContribution = Math.max(0, parseBRLInput(sp.aporte ?? "") ?? 1000);
  const cdi = rates.cdi?.value ?? FALLBACK.cdi;
  const ipca = rates.ipca12m?.value ?? FALLBACK.ipca;
  const scenarios = {
    conservative: cdi * 0.85, // 100% CDI net of 15% IR (long-term bracket)
    expected: cdi, // 100% CDI gross — e.g. LCI/LCA-equivalent
    aggressive: (1 + ipca) * 1.06 - 1, // IPCA + 6%
  };
  const labels = {
    conservative: `CDI líquido de IR · ${pct(scenarios.conservative)} a.a.`,
    expected: `100% CDI · ${pct(scenarios.expected)} a.a.`,
    aggressive: `IPCA + 6% · ${pct(scenarios.aggressive)} a.a.`,
  };
  const projection = Array.from({ length: 121 }, (_, m) => ({
    month: m,
    conservative: futureValue(total, monthlyContribution, scenarios.conservative, m),
    expected: futureValue(total, monthlyContribution, scenarios.expected, m),
    aggressive: futureValue(total, monthlyContribution, scenarios.aggressive, m),
  }));
  const tenYearReal = futureValue(total, monthlyContribution, realRate(scenarios.conservative, ipca), 120);

  return (
    <>
      <PageHeader title="Investimentos" subtitle="Patrimônio investido e projeções" />

      <div className="grid grid-cols-12 gap-4 mb-4">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Total investido</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(total)}</CardValue>
          <div className="text-xs text-fg-muted mt-3">
            Custo: {formatBRLCompact(totalCost)}
            {stale && ` · posição mais antiga: ${formatDayMonth(stale)}`}
          </div>
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Lucro/Prejuízo</CardTitle>
          </CardHeader>
          <CardValue className={pnl >= 0 ? "text-accent" : "text-danger"}>{formatBRL(pnl)}</CardValue>
          <div className={`text-xs mt-3 ${pnl >= 0 ? "text-accent" : "text-danger"}`}>
            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
          </div>
          {withheld > 0 && (
            <div className="text-xs text-fg-subtle mt-1">
              Descontados {formatBRL(withheld)} de IR e IOF             </div>
          )}
        </Card>
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Posições</CardTitle>
          </CardHeader>
          <CardValue>{investments.length}</CardValue>
          <div className="text-xs text-fg-muted mt-3">{allocation.length} classes de ativos</div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        {[
          { label: "CDI", rate: rates.cdi, sub: "a.a." },
          { label: "Selic meta", rate: rates.selic, sub: "a.a." },
          { label: "IPCA", rate: rates.ipca12m, sub: "12 meses" },
          {
            label: "CDI real",
            rate: rates.cdi && rates.ipca12m ? { value: realRate(rates.cdi.value, rates.ipca12m.value), date: rates.cdi.date } : null,
            sub: "acima da inflação",
          },
        ].map((b) => (
          <Card key={b.label} className="p-4">
            <div className="text-xs text-fg-muted">{b.label}</div>
            <div className="text-xl font-semibold mt-1">{b.rate ? pct(b.rate.value) : "—"}</div>
            <div className="text-[10px] text-fg-subtle mt-1">
              {b.rate ? `${b.sub} · BCB ${b.rate.date}` : "BCB indisponível"}
            </div>
          </Card>
        ))}
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
                  {formatBRLCompact(a.value)} · {total > 0 ? Math.round((a.value / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="col-span-12 lg:col-span-7">
          <CardHeader>
            <CardTitle>Projeção 10 anos</CardTitle>
            <form className="flex items-center gap-2 text-xs text-fg-muted">
              aporte/mês R$
              <input
                name="aporte"
                defaultValue={String(monthlyContribution).replace(".", ",")}
                inputMode="decimal"
                className="w-24 bg-bg-elev border border-border rounded px-2 py-1 text-fg outline-none focus:border-accent"
              />
              <button className="px-2 py-1 rounded border border-border hover:text-fg">OK</button>
            </form>
          </CardHeader>
          <ProjectionChart data={projection} labels={labels} />
          <p className="text-xs text-fg-muted mt-3">
            Em 10 anos no cenário CDI líquido: {formatBRLCompact(projection[120]!.conservative)} nominais ≈{" "}
            {formatBRLCompact(tenYearReal)} em poder de compra de hoje (IPCA {pct(ipca)}).
            {!rates.cdi && " Taxas do BCB indisponíveis — usando valores de referência."}
          </p>
        </Card>
      </div>

      {crypto.wallets > 0 && (
        <Link
          href="/cripto"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-bg-card p-4 hover:bg-bg-hover"
        >
          <div>
            <div className="font-semibold">Cripto</div>
            <div className="text-xs text-fg-muted">
              {crypto.wallets} carteira(s) · {crypto.symbols.join(", ")}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums">{formatBRL(crypto.total.brl)}</div>
            <div className="text-xs text-fg-muted tabular-nums">{formatUSD(crypto.total.usd)}</div>
          </div>
        </Link>
      )}

      <Card className="p-0 overflow-hidden">
        <PositionsTable positions={positions} />
      </Card>

    </>
  );
}
