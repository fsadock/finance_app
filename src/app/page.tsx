import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import {
  getGoals,
  getMonthBudgetProgress,
  getMonthSpend,
  getMonthlyCashflow,
  getNetWorth,
  getReviewTransactions,
  getTopCategories,
  getUpcomingRecurrings,
} from "@/lib/queries";
import { formatBRL, formatBRLCompact, formatDate, formatMonthLong } from "@/lib/format";
import Link from "next/link";
import { ArrowRight, AlertCircle } from "lucide-react";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { CategoryDonut } from "@/components/dashboard/category-donut";

export default async function DashboardPage() {
  const now = new Date();
  const [networth, monthSpend, top, review, upcoming, goals, cashflow, budgets] = await Promise.all([
    getNetWorth(),
    getMonthSpend(now),
    getTopCategories(now, 6),
    getReviewTransactions(6),
    getUpcomingRecurrings(6),
    getGoals(),
    getMonthlyCashflow(6),
    getMonthBudgetProgress(now),
  ]);
  const totalBudget = budgets.reduce((s, b) => s + b.budget.monthlyLimit, 0);
  const budgetPct = totalBudget > 0 ? Math.min(100, (monthSpend.spent / totalBudget) * 100) : 0;

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Visão geral · ${formatMonthLong(now)}`} />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Patrimônio líquido</CardTitle>
          </CardHeader>
          <CardValue className="text-accent">{formatBRL(networth.net)}</CardValue>
          <div className="mt-3 text-xs text-fg-muted flex gap-4">
            <span>Ativos: {formatBRLCompact(networth.assets)}</span>
            <span>Dívidas: {formatBRLCompact(networth.debts)}</span>
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Gasto do mês</CardTitle>
            <span className="text-xs text-fg-muted">{Math.round(budgetPct)}% do orçamento</span>
          </CardHeader>
          <CardValue>{formatBRL(monthSpend.spent)}</CardValue>
          <div className="mt-4 h-2 rounded-full bg-bg-hover overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${budgetPct}%`,
                background: budgetPct > 90 ? "var(--color-danger)" : budgetPct > 70 ? "var(--color-warn)" : "var(--color-accent)",
              }}
            />
          </div>
          <div className="mt-3 text-xs text-fg-muted">de {formatBRLCompact(totalBudget)} orçados</div>
        </Card>

        <Card className="col-span-12 md:col-span-4">
          <CardHeader>
            <CardTitle>Recebido no mês</CardTitle>
          </CardHeader>
          <CardValue>{formatBRL(monthSpend.income)}</CardValue>
          <div className="mt-3 text-xs">
            <span className={monthSpend.income - monthSpend.spent >= 0 ? "text-accent" : "text-danger"}>
              Saldo: {formatBRL(monthSpend.income - monthSpend.spent)}
            </span>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-8">
          <CardHeader>
            <CardTitle>Fluxo de caixa</CardTitle>
            <Link href="/cashflow" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CashflowChart data={cashflow} />
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <CardHeader>
            <CardTitle>Top categorias</CardTitle>
            <Link href="/categories" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CategoryDonut data={top.map((t) => ({ name: t.category.name, value: t.spent, color: t.category.color ?? "#6b7280" }))} />
          <ul className="mt-4 space-y-2">
            {top.map((t) => (
              <li key={t.category.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: t.category.color ?? "#6b7280" }} />
                  {t.category.name}
                </span>
                <span className="text-fg-muted">{formatBRL(t.spent)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="col-span-12 lg:col-span-6">
          <CardHeader>
            <CardTitle>Transações para revisar</CardTitle>
            <Link href="/transactions?status=REVIEW" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          {review.length === 0 ? (
            <div className="text-sm text-fg-muted py-6 text-center">Tudo categorizado.</div>
          ) : (
            <ul className="divide-y divide-border">
              {review.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-lg bg-warn/10 grid place-items-center shrink-0">
                      <AlertCircle className="size-4 text-warn" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.description}</div>
                      <div className="text-xs text-fg-muted">{formatDate(t.date)} · {t.account.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={t.amount < 0 ? "" : "text-accent"}>{formatBRL(t.amount)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="col-span-12 lg:col-span-6">
          <CardHeader>
            <CardTitle>Próximas recorrentes</CardTitle>
            <Link href="/recurrings" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <ul className="divide-y divide-border">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-fg-muted">{formatDate(r.nextDate)} · {r.cadence.toLowerCase()}</div>
                </div>
                <div className={r.amount < 0 ? "" : "text-accent"}>{formatBRL(r.amount)}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="col-span-12">
          <CardHeader>
            <CardTitle>Metas</CardTitle>
            <Link href="/goals" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {goals.map((g) => {
              const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
              return (
                <div key={g.id} className="rounded-xl border border-border bg-bg-elev p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-xs text-fg-muted">{Math.round(pct)}%</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-bg-hover overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.color ?? "var(--color-accent)" }} />
                  </div>
                  <div className="mt-2 text-xs text-fg-muted">
                    {formatBRLCompact(g.currentAmount)} de {formatBRLCompact(g.targetAmount)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
