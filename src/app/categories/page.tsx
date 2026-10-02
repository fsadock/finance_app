import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { getBudgetCategories } from "@/lib/data/categories";
import { formatBRL, lastMonthKeys } from "@/lib/domain/format";
import { CategoriesTrendChart } from "@/components/categories/trend-chart";
import { PeriodPicker } from "@/components/layout/period-picker";
import { parsePeriod, formatPeriodLabel, monthRangeQuery } from "@/lib/domain/period";
import { CategoryCreateDialog } from "@/components/categories/category-create-dialog";
import { BudgetEditor } from "@/components/categories/budget-editor";
import { getRebalanceSuggestions } from "@/lib/data/budgets";
import { getCategorySpend } from "@/lib/data/spending";
import { getBudgetsForMonth, getCategorySpendByMonth } from "@/lib/data/budgets";
import { RebalanceSuggestions } from "@/components/categories/rebalance-suggestions";
import { Breakdown } from "@/components/ui/breakdown";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Money } from "@/components/ui/money";

/**
 * The band holding every category outside the named ones, so the stack adds up. Not "Outros": that is a
 * real category of the owner's, and two different things must not share a name on the same chart.
 */
const OTHER_CATEGORIES = "Demais categorias";

/** How many categories the chart names before the rest go into one band. */
const TREND_SIZE = 6;

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

  const spentIn = (categoryId: string, mo: string) => history.get(categoryId)?.get(mo) ?? 0;

  // The cards below are about the month being browsed, so they rank by it. The chart covers six months
  // and has to rank by those six: the biggest spend of the period had been landing in the "rest" band
  // because one quiet month kept it out of the top of the current one.
  const spentOverPeriod = (categoryId: string) => months.reduce((sum, mo) => sum + spentIn(categoryId, mo), 0);
  const byPeriod = [...all].sort((a, b) => spentOverPeriod(b.cat.id) - spentOverPeriod(a.cat.id));
  const trendCategories = byPeriod.slice(0, TREND_SIZE);
  const rest = byPeriod.slice(TREND_SIZE);
  // Stacked, the bar is every category added up, so what the named ones leave out has to be in it.
  // A month where refunds outweighed spending is reported as the negative it is: clamping it to zero
  // used to inflate these months by exactly the amount that came back.
  const trendData = months.map((mo) => {
    const row: Record<string, number | string> = { month: mo };
    for (const { cat } of trendCategories) row[cat.name] = spentIn(cat.id, mo);
    row[OTHER_CATEGORIES] = rest.reduce((sum, { cat }) => sum + spentIn(cat.id, mo), 0);
    return row;
  });

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle={`${formatPeriodLabel(period)} · gastos vs orçamento`}
        actions={
          <>
            <RebalanceSuggestions monthStr={period.key} suggestions={suggestions} />
            <PeriodPicker />
            <CategoryCreateDialog />
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Últimos 6 meses · {TREND_SIZE} maiores categorias do período</CardTitle>
        </CardHeader>
        <CategoriesTrendChart
          data={trendData}
          categories={[
            ...trendCategories.map((v) => ({ name: v.cat.name, color: v.cat.color ?? "#6b7280" })),
            { name: OTHER_CATEGORIES, color: "#4b5563" },
          ]}
        />
        {rest.length > 0 && (
          <div className="mt-3 border-t border-border pt-3 text-xs text-fg-muted">
            <Breakdown
              title={`${OTHER_CATEGORIES} · ${months.length} meses`}
              description="A banda cinza do gráfico, categoria por categoria."
              total={rest.reduce((sum, { cat }) => sum + spentOverPeriod(cat.id), 0)}
              parts={rest
                .map(({ cat }) => ({ id: cat.id, label: cat.name, value: spentOverPeriod(cat.id) }))
                .filter((p) => Math.abs(p.value) >= 0.01)}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: "#4b5563" }} />
                O que há dentro de &quot;{OTHER_CATEGORIES}&quot;
              </span>
            </Breakdown>
          </div>
        )}
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
                  <Link href={`/transactions?cat=${cat.id}&${monthRangeQuery(period.key)}`} className="font-medium hover:text-accent">
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
                      <Money>{formatBRL(rolloverAmount)}</Money>
                    </span>
                  )}
                </div>
                <span className="text-xs text-fg-muted">{cat.group}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-semibold"><Money>{formatBRL(spent)}</Money></span>
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
                    {Math.abs(effective - budget) >= 0.01 && <span>Efetivo: <Money>{formatBRL(effective)}</Money></span>}
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
