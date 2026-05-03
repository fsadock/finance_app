import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardValue } from "@/components/ui/card";
import {
  getMonthBudgetProgress,
  getMonthSpend,
  getMonthlyCashflow,
  getNetWorth,
  getReviewTransactions,
  getSpendingPace,
  getTopCategories,
  getUpcomingRecurrings,
  getCCSpendingData,
} from "@/lib/queries";
import { formatBRL, formatBRLCompact, formatDate } from "@/lib/format";
import Link from "next/link";
import { ArrowRight, Wallet } from "lucide-react";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { SpendingPaceChart } from "@/components/dashboard/spending-pace-chart";
import { CCLimitEditor } from "@/components/dashboard/cc-limit-editor";
import { CategoryDonut } from "@/components/dashboard/category-donut";
import { PeriodPicker } from "@/components/period-picker";
import { parsePeriod, formatPeriodLabel } from "@/lib/period";
import { CategoryPicker } from "@/components/category-picker";
import { prisma } from "@/lib/db";

type Props = { searchParams: Promise<{ month?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const sp = await searchParams;
  const period = parsePeriod(sp.month);
  const periodDate = period.date;

  const ccData = await getCCSpendingData(periodDate);
  const [networth, monthSpend, top, review, upcoming, cashflow, budgets, categories, pace] = await Promise.all([
    getNetWorth(),
    getMonthSpend(periodDate),
    getTopCategories(periodDate, 6),
    getReviewTransactions(6),
    getUpcomingRecurrings(10),
    getMonthlyCashflow(6),
    getMonthBudgetProgress(periodDate),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    getSpendingPace(periodDate, ccData.chartStart, ccData.chartEnd),
  ]);

  const categoryProps = categories.map((c) => ({ id: c.id, name: c.name, color: c.color, group: c.group }));
  const totalBudget = budgets.reduce((s, b) => s + b.budget.monthlyLimit, 0);
  const budgetPct = totalBudget > 0 ? Math.min(100, (monthSpend.spent / totalBudget) * 100) : 0;

  const today = new Date();
  const upcomingThisMonth = upcoming.filter(r => {
    const d = new Date(r.nextDate);
    return d.getMonth() === periodDate.getMonth() && d.getFullYear() === periodDate.getFullYear() && d > today;
  });
  const upcomingTotal = upcomingThisMonth.reduce((s, r) => s + Math.abs(r.amount), 0);
  const freeToSpend = Math.max(0, totalBudget - monthSpend.spent - upcomingTotal);

  // Merge CC data into pace chart rows
  const mergedPaceData = pace.data.map((row, i) => ({
    ...row,
    ccActual: ccData.data[i]?.ccActual ?? null,
    ccIdeal: ccData.data[i]?.ccIdeal ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Visão geral · ${formatPeriodLabel(period)}`}
        actions={<PeriodPicker />}
      />

      <div className="grid grid-cols-12 gap-4">
        {/* Row 1: Key Metrics */}
        <Card className="col-span-12 md:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-4 text-accent" /> Liberdade p/ gastar
            </CardTitle>
          </CardHeader>
          <CardValue className="text-accent">{formatBRL(freeToSpend)}</CardValue>
          <div className="mt-3 text-xs text-fg-muted">
            Livre após contas e orçamento
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-3">
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

        {/* Row 2: Charts */}
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
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: t.category.color ?? "#6b7280" }} />
                  {t.category.name}
                </span>
                <span className="text-fg-muted">{formatBRL(t.spent)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Row 3: Details */}
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
                        categories={categoryProps}
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
      </div>
    </>
  );
}
