import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { getBudgetCategories } from "@/lib/data/categories";
import { formatBRL, lastMonthKeys } from "@/lib/domain/format";
import { CategoriesTrendChart } from "@/components/categories/trend-chart";
import { PeriodPicker } from "@/components/layout/period-picker";
import { parsePeriod, formatPeriodLabel } from "@/lib/domain/period";
import { CategoryCreateDialog } from "@/components/categories/category-create-dialog";
import { BudgetEditor } from "@/components/categories/budget-editor";
import { getRebalanceSuggestions } from "@/lib/data/budgets";
import { getCategorySpend } from "@/lib/data/spending";
import { getBudgetsForMonth, getCategorySpendByMonth } from "@/lib/data/budgets";
import { RebalanceSuggestions } from "@/components/categories/rebalance-suggestions";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Props = { searchParams: Promise<{ month?: string; all?: string }> };

export default async function CategoriesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const period = parsePeriod(sp.month);
  const anchor = period.date;
  const months = lastMonthKeys(6, anchor);

  const categories = await getBudgetCategories();
  const [budgets, spend, history, suggestions] = await Promise.all([
    getBudgetsForMonth(anchor),
    getCategorySpend(anchor),
    getCategorySpendByMonth(categories.map((c) => c.id), months),
    getRebalanceSuggestions(anchor),
  ]);

  const all = categories
    .filter((c) => !c.isIncome)
    .map((c) => ({
      cat: c,
      spent: spend.get(c.id) ?? 0,
      budget: budgets.get(c.id)?.limit ?? 0,
      effective: budgets.get(c.id)?.effective ?? 0,
    }))
    .sort((a, b) => b.spent - a.spent);
  const active = all.filter((v) => v.spent > 0 || v.budget > 0);
  const visible = showAll ? all : active;
  const hiddenCount = all.length - active.length;

  const trendCategories = active.slice(0, 6);
  const trendData = months.map((mo) => {
    const row: Record<string, number | string> = { month: mo };
    for (const { cat } of trendCategories) row[cat.name] = Math.max(0, history.get(cat.id)?.get(mo) ?? 0);
    return row;
  });

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle={`${formatPeriodLabel(period)} · gastos vs orçamento`}
        actions={
          <div className="flex items-center gap-2">
            <RebalanceSuggestions monthStr={period.key} suggestions={suggestions} />
            <PeriodPicker />
            <CategoryCreateDialog />
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Tendência últimos 6 meses · top 6 categorias</CardTitle>
        </CardHeader>
        <CategoriesTrendChart
          data={trendData}
          categories={trendCategories.map((v) => ({ name: v.cat.name, color: v.cat.color ?? "#6b7280" }))}
        />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map(({ cat, spent, budget, effective }) => {
          const pct = effective > 0 ? (spent / effective) * 100 : 0;
          const overBudget = pct > 100;
          const rolloverAmount = effective - budget;

          return (
            <Card key={cat.id}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full" style={{ background: cat.color ?? "#6b7280" }} />
                  <Link href={`/transactions?cat=${cat.id}&month=${period.key}`} className="font-medium hover:text-accent">
                    {cat.name}
                  </Link>
                  {cat.rolloverEnabled && Math.abs(rolloverAmount) >= 0.01 && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        rolloverAmount > 0 ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
                      )}
                      title={`Rollover dos meses anteriores: ${formatBRL(rolloverAmount)}`}
                    >
                      {rolloverAmount > 0 ? "+" : ""}
                      {formatBRL(rolloverAmount)}
                    </span>
                  )}
                </div>
                <span className="text-xs text-fg-muted">{cat.group}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-semibold">{formatBRL(spent)}</span>
                <BudgetEditor
                  categoryId={cat.id}
                  startMonth={period.key}
                  current={budget}
                  rolloverEnabled={cat.rolloverEnabled}
                />
              </div>
              {effective > 0 && (
                <>
                  <div className="mt-3 h-2 rounded-full bg-bg-hover overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        background: overBudget ? "var(--color-danger)" : pct > 80 ? "var(--color-warn)" : (cat.color ?? "var(--color-accent)"),
                      }}
                    />
                  </div>
                  <div className="mt-2 text-[10px] text-fg-muted flex justify-between">
                    <span>{Math.round(pct)}% do orçamento{cat.rolloverEnabled ? " efetivo" : ""}</span>
                    {Math.abs(effective - budget) >= 0.01 && <span>Efetivo: {formatBRL(effective)}</span>}
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-fg-muted text-center mt-6">
          {showAll ? (
            <Link href={`?month=${period.key}`} className="hover:text-fg underline-offset-2 hover:underline">
              Ocultar categorias sem gastos
            </Link>
          ) : (
            <Link href={`?month=${period.key}&all=1`} className="hover:text-fg underline-offset-2 hover:underline">
              {hiddenCount} categoria(s) sem gastos no período · mostrar todas
            </Link>
          )}
        </p>
      )}
      {visible.length === 0 && (
        <Card className="text-center text-sm text-fg-muted py-12">
          Sem gastos categorizados em {formatPeriodLabel(period)}.
        </Card>
      )}
    </>
  );
}
