import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatBRL, monthBounds } from "@/lib/format";
import { CategoriesTrendChart } from "@/components/categories/trend-chart";
import { PeriodPicker } from "@/components/period-picker";
import { parsePeriod, formatPeriodLabel } from "@/lib/period";
import { CategoryCreateDialog } from "@/components/category-create-dialog";
import { BudgetEditor } from "@/components/budget-editor";
import { batchGetEffectiveBudgets, getRebalanceSuggestions } from "@/lib/queries";
import { RebalanceSuggestions } from "@/components/rebalance-suggestions";
import { cn } from "@/lib/utils";

type Props = { searchParams: Promise<{ month?: string; all?: string }> };

export default async function CategoriesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const period = parsePeriod(sp.month);
  const anchor = period.date;
  const { start, end } = monthBounds(anchor);
  const monthStr = period.key;

  const [categories, budgets, monthSpend, sixMonths, suggestions] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.budget.findMany({ where: { startMonth: monthStr } }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { date: { gte: start, lt: end }, amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    (async () => {
      const startBack = new Date(anchor);
      startBack.setMonth(startBack.getMonth() - 5);
      startBack.setDate(1);
      startBack.setHours(0, 0, 0, 0);
      const endBack = new Date(anchor);
      endBack.setMonth(endBack.getMonth() + 1);
      endBack.setDate(1);
      endBack.setHours(0, 0, 0, 0);
      return prisma.transaction.findMany({
        where: { date: { gte: startBack, lt: endBack }, amount: { lt: 0 } },
        select: { date: true, amount: true, categoryId: true },
      });
    })(),
    getRebalanceSuggestions(anchor),
  ]);

  const effectiveMap = await batchGetEffectiveBudgets(categories.map((c) => c.id), anchor);

  const spentMap = new Map(monthSpend.map((m) => [m.categoryId, Math.abs(m._sum.amount ?? 0)]));
  const budgetMap = new Map(budgets.map((b) => [b.categoryId, b.monthlyLimit]));

  const grouped = new Map<string, Map<string, number>>(); // catId -> month -> spend
  for (const t of sixMonths) {
    if (!t.categoryId) continue;
    const k = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, "0")}`;
    if (!grouped.has(t.categoryId)) grouped.set(t.categoryId, new Map());
    const m = grouped.get(t.categoryId)!;
    m.set(k, (m.get(k) ?? 0) + Math.abs(t.amount));
  }
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() - i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const trendData = months.map((mo) => {
    const row: Record<string, number | string> = { month: mo };
    for (const c of categories) {
      row[c.name] = grouped.get(c.id)?.get(mo) ?? 0;
    }
    return row;
  });

  const all = categories
    .filter((c) => !c.excludeFromBudget)
    .map((c) => ({
      cat: c,
      spent: spentMap.get(c.id) ?? 0,
      budget: budgetMap.get(c.id) ?? 0,
      effective: effectiveMap.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.spent - a.spent);
  const active = all.filter((v) => v.spent > 0 || v.budget > 0);
  const visible = showAll ? all : active;
  const hiddenCount = all.length - active.length;

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle={`${formatPeriodLabel(period)} · gastos vs orçamento`}
        actions={
          <div className="flex items-center gap-2">
            <RebalanceSuggestions monthStr={monthStr} suggestions={suggestions} />
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
          categories={visible.slice(0, 6).map((v) => ({ name: v.cat.name, color: v.cat.color ?? "#6b7280" }))}
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
                  <span className="font-medium">{cat.name}</span>
                  {cat.rolloverEnabled && rolloverAmount !== 0 && (
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                        rolloverAmount > 0 ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
                      )}
                      title={`Rollover do mês anterior: ${formatBRL(rolloverAmount)}`}
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
                  startMonth={monthStr}
                  current={budget}
                  rolloverEnabled={cat.rolloverEnabled}
                />
              </div>
              {effective > 0 && (
                <div className="mt-3 h-2 rounded-full bg-bg-hover overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: overBudget
                        ? "var(--color-danger)"
                        : pct > 80
                        ? "var(--color-warn)"
                        : cat.color ?? "var(--color-accent)",
                    }}
                  />
                </div>
              )}
              {effective > 0 && (
                <div className="mt-2 text-[10px] text-fg-muted flex justify-between">
                  <span>{Math.round(pct)}% do orçamento efetivo</span>
                  {effective !== budget && <span>Efetivo: {formatBRL(effective)}</span>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-fg-muted text-center mt-6">
          {showAll ? (
            <a href={`?month=${period.key}`} className="hover:text-fg underline-offset-2 hover:underline">
              Ocultar categorias sem gastos
            </a>
          ) : (
            <a href={`?month=${period.key}&all=1`} className="hover:text-fg underline-offset-2 hover:underline">
              {hiddenCount} categoria(s) sem gastos no período · mostrar todas
            </a>
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
