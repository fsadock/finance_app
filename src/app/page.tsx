import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import {
  getActiveRecurrings,
  getCCSpendingData,
  getMonthBudgetProgress,
  getMonthSpend,
  getMonthlyCashflow,
  getNetWorth,
  getReviewTransactions,
  getSpendingPace,
  getTopCategories,
} from "@/lib/data/queries";
import { formatBRL, formatBRLCompact, formatDate, monthKey, startOfDay } from "@/lib/domain/format";
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { SpendingPaceChart } from "@/components/dashboard/spending-pace-chart";
import { CCLimitEditor } from "@/components/dashboard/cc-limit-editor";
import { CategoryDonut } from "@/components/dashboard/category-donut";
import { PeriodPicker } from "@/components/period-picker";
import { parsePeriod, formatPeriodLabel } from "@/lib/domain/period";
import { CategoryPicker } from "@/components/category-picker";
import { CategorizePendingButton } from "@/components/categorize-pending-button";
import { prisma } from "@/lib/infra/db";
import { getPluggyCredentials } from "@/lib/infra/settings";
import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ month?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  // First run: nothing configured and no data yet → go straight to the setup wizard
  const [pluggy, accounts] = await Promise.all([getPluggyCredentials(), prisma.account.count()]);
  if (!pluggy.configured && accounts === 0) redirect("/setup");

  const sp = await searchParams;
  const period = parsePeriod(sp.month);
  const periodDate = period.date;

  const [ccData, networth, monthSpend, top, review, recurrings, cashflow, budgets, categories] = await Promise.all([
    getCCSpendingData(periodDate),
    getNetWorth(),
    getMonthSpend(periodDate),
    getTopCategories(periodDate, 6),
    getReviewTransactions(6),
    getActiveRecurrings(),
    getMonthlyCashflow(6, periodDate),
    getMonthBudgetProgress(periodDate),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true, group: true } }),
  ]);

  const totalBudget = budgets.reduce((s, b) => s + Math.max(0, b.effective), 0);
  const pace = await getSpendingPace(periodDate, totalBudget, ccData.chartStart, ccData.chartEnd);
  const budgetPct = totalBudget > 0 ? Math.min(100, (monthSpend.spent / totalBudget) * 100) : 0;

  // Bills still due this period (outflows only — upcoming income must not reduce free-to-spend)
  const today = startOfDay(new Date());
  const upcomingBills = recurrings.filter(
    (r) => r.amount < 0 && monthKey(r.upcoming) === period.key && r.upcoming >= today && !r.likelyInactive
  );
  const upcomingTotal = upcomingBills.reduce((s, r) => s + Math.abs(r.amount), 0);
  const freeToSpend = Math.max(0, totalBudget - monthSpend.spent - upcomingTotal);

  const mergedPaceData = pace.data.map((row, i) => ({
    ...row,
    ccActual: ccData.data[i]?.ccActual ?? null,
    ccIdeal: ccData.data[i]?.ccIdeal ?? null,
  }));

  const nextRecurrings = recurrings.filter((r) => !r.likelyInactive).slice(0, 6);
  const budgetRows = [...budgets].sort((a, b) => b.pct - a.pct).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Visão geral · ${formatPeriodLabel(period)}`}
        actions={<PeriodPicker />}
      />

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 md:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-accent" /> Liberdade p/ gastar
            </CardTitle>
          </CardHeader>
          <CardValue className="text-accent">{formatBRL(freeToSpend)}</CardValue>
          <div className="mt-3 text-xs text-fg-muted">
            {totalBudget > 0
              ? `Orçamento − gastos − ${formatBRLCompact(upcomingTotal)} em contas a vencer`
              : "Defina orçamentos em Categorias"}
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-3">
          <CardHeader>
            <CardTitle>Gasto do mês</CardTitle>
            {totalBudget > 0 && <span className="text-xs text-fg-muted">{Math.round(budgetPct)}% do orçamento</span>}
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
        </Card>

        <Card className="col-span-12 md:col-span-3">
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

        <Card className="col-span-12 md:col-span-3">
          <CardHeader>
            <CardTitle>Patrimônio líquido</CardTitle>
          </CardHeader>
          <CardValue className="text-accent">{formatBRL(networth.net)}</CardValue>
          <div className="mt-3 text-xs text-fg-muted truncate">
            {formatBRLCompact(networth.assets)} Ativos · {formatBRLCompact(networth.debts)} Dívidas
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-8">
          <CardHeader>
            <CardTitle>Ritmo de Gastos</CardTitle>
            <div className="text-xs text-fg-muted">
              Real (verde) vs Ideal (tracejado)
              {ccData.totalBudget > 0 && " · Cartão (laranja)"}
            </div>
          </CardHeader>
          <SpendingPaceChart data={mergedPaceData} showCC={ccData.totalBudget > 0} />
          <CCLimitEditor
            current={ccData.totalBudget}
            currentSpend={ccData.currentSpend}
            remaining={ccData.remaining}
            dailyAllowance={ccData.dailyAllowance}
            isOverBudget={ccData.isOverBudget}
            closeDay={ccData.closeDay}
          />
        </Card>

        <Card className="col-span-12 lg:col-span-4">
          <CardHeader>
            <CardTitle>Top categorias</CardTitle>
          </CardHeader>
          <CategoryDonut data={top.map((t) => ({ name: t.category.name, value: t.spent, color: t.category.color ?? "#6b7280" }))} />
          <ul className="mt-4 space-y-2">
            {top.slice(0, 4).map((t) => (
              <li key={t.category.id} className="flex items-center justify-between text-sm">
                <Link
                  href={`/transactions?cat=${t.category.id}&month=${period.key}`}
                  className="flex items-center gap-2 hover:text-accent"
                >
                  <span className="size-2.5 rounded-full" style={{ background: t.category.color ?? "#6b7280" }} />
                  {t.category.name}
                </Link>
                <span className="text-fg-muted">{formatBRL(t.spent)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="col-span-12 lg:col-span-6">
          <CardHeader>
            <CardTitle>Transações para revisar{review.total > 0 && ` · ${review.total}`}</CardTitle>
            <div className="flex items-center gap-3">
              {review.total > 0 && <CategorizePendingButton compact />}
              <Link href="/transactions?status=REVIEW" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
                Ver tudo <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardHeader>
          {review.items.length === 0 ? (
            <div className="text-sm text-fg-muted py-6 text-center">Tudo categorizado.</div>
          ) : (
            <ul className="divide-y divide-border">
              {review.items.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.description}</div>
                    <div className="text-xs text-fg-muted mt-0.5">{formatDate(t.date)} · {t.account.name}</div>
                    <div className="mt-1.5">
                      <CategoryPicker
                        txId={t.id}
                        currentCategoryId={t.categoryId}
                        currentCategoryName={t.category?.name ?? null}
                        currentCategoryColor={t.category?.color ?? null}
                        needsReview={true}
                        categories={categories}
                      />
                    </div>
                  </div>
                  <div className={`text-right whitespace-nowrap ${t.amount < 0 ? "" : "text-accent"}`}>
                    {formatBRL(t.amount)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="col-span-12 lg:col-span-6">
          <CardHeader>
            <CardTitle>Fluxo de caixa (6 meses)</CardTitle>
            <Link href="/cashflow" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CashflowChart data={cashflow} />
        </Card>

        <Card className="col-span-12 lg:col-span-6">
          <CardHeader>
            <CardTitle>Próximos lançamentos recorrentes</CardTitle>
            <Link href="/recurrings" className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          {nextRecurrings.length === 0 ? (
            <div className="text-sm text-fg-muted py-6 text-center">Nenhuma recorrência detectada ainda.</div>
          ) : (
            <ul className="divide-y divide-border">
              {nextRecurrings.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{r.name}</div>
                    <div className="text-xs text-fg-muted">{formatDate(r.upcoming)}{r.category && ` · ${r.category.name}`}</div>
                  </div>
                  <span className={r.amount > 0 ? "text-accent" : ""}>{formatBRL(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="col-span-12 lg:col-span-6">
          <CardHeader>
            <CardTitle>Orçamentos</CardTitle>
            <Link href={`/categories?month=${period.key}`} className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
              Ver tudo <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          {budgetRows.length === 0 ? (
            <div className="text-sm text-fg-muted py-6 text-center">Nenhum orçamento definido.</div>
          ) : (
            <ul className="space-y-3">
              {budgetRows.map((b) => (
                <li key={b.category.id} className="text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span>{b.category.name}</span>
                    <span className="text-xs text-fg-muted">
                      {formatBRL(b.spent)} de {formatBRL(b.effective)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-hover overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, b.pct)}%`,
                        background: b.pct > 100 ? "var(--color-danger)" : b.pct > 80 ? "var(--color-warn)" : (b.category.color ?? "var(--color-accent)"),
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
