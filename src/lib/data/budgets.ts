import { prisma } from "@/lib/infra/db";
import { lastMonthKeys, monthKey, monthKeyToDate } from "@/lib/domain/format";
import { FLOW_SELECT, SPEND_WHERE, spendDelta } from "@/lib/domain/flows";
import { effectiveWithRollover, limitInEffect, planRebalance, type BudgetRow } from "@/lib/domain/budgets";
import { getCategorySpend } from "@/lib/data/spending";

/** How many months of history rollover looks back over. */
const ROLLOVER_WINDOW_MONTHS = 6;

type CategoryBudget = { limit: number; effective: number };

/**
 * Budget in effect for every category that has one in `month` (carry-forward), plus the
 * rollover-adjusted effective amount. 3 queries regardless of category count.
 */
export async function getBudgetsForMonth(month: Date): Promise<Map<string, CategoryBudget>> {
  const key = monthKey(month);
  const [rows, rolloverCats] = await Promise.all([
    prisma.budget.findMany({
      where: { startMonth: { lte: key } },
      orderBy: { startMonth: "asc" },
      select: { categoryId: true, startMonth: true, monthlyLimit: true },
    }),
    prisma.category.findMany({ where: { rolloverEnabled: true }, select: { id: true } }),
  ]);

  const byCategory = new Map<string, BudgetRow[]>();
  for (const r of rows) {
    if (!byCategory.has(r.categoryId)) byCategory.set(r.categoryId, []);
    byCategory.get(r.categoryId)!.push(r);
  }

  const rolloverIds = new Set(rolloverCats.map((c) => c.id).filter((id) => byCategory.has(id)));
  const keys = lastMonthKeys(ROLLOVER_WINDOW_MONTHS + 1, month);
  const spent = rolloverIds.size > 0 ? await getCategorySpendByMonth([...rolloverIds], keys) : new Map();

  const result = new Map<string, CategoryBudget>();
  for (const [categoryId, list] of byCategory) {
    const limit = limitInEffect(list, key);
    const effective = rolloverIds.has(categoryId)
      ? effectiveWithRollover(
          keys,
          (k) => limitInEffect(list, k),
          (k) => spent.get(categoryId)?.get(k) ?? 0
        )
      : limit;
    if (limit > 0 || effective !== 0) result.set(categoryId, { limit, effective });
  }
  return result;
}

/** categoryId → monthKey → net spend (expenses − refunds), for budget-relevant transactions. */
export async function getCategorySpendByMonth(categoryIds: string[], keys: string[]) {
  const start = monthKeyToDate(keys[0]!);
  const last = monthKeyToDate(keys[keys.length - 1]!);
  const end = new Date(last.getFullYear(), last.getMonth() + 1, 1);
  const txs = await prisma.transaction.findMany({
    where: { AND: [{ categoryId: { in: categoryIds }, chargeDate: { gte: start, lt: end } }, SPEND_WHERE] },
    select: { ...FLOW_SELECT, chargeDate: true },
  });
  const out = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (!t.categoryId) continue;
    const k = monthKey(t.chargeDate);
    if (!out.has(t.categoryId)) out.set(t.categoryId, new Map());
    const m = out.get(t.categoryId)!;
    m.set(k, (m.get(k) ?? 0) + spendDelta(t));
  }
  return out;
}

/** Budgets in effect for the month (carry-forward + rollover) joined with actual spend. */
export async function getMonthBudgetProgress(month = new Date()) {
  const [budgets, spend] = await Promise.all([getBudgetsForMonth(month), getCategorySpend(month)]);
  const categories = await prisma.category.findMany({ where: { id: { in: [...budgets.keys()] } } });
  return categories
    .map((category) => {
      const b = budgets.get(category.id)!;
      const spent = spend.get(category.id) ?? 0;
      return {
        category,
        limit: b.limit,
        effective: b.effective,
        spent,
        pct: b.effective > 0 ? (spent / b.effective) * 100 : 0,
      };
    })
    .filter((b) => b.limit > 0);
}

export async function getRebalanceSuggestions(month = new Date()) {
  return planRebalance(await getMonthBudgetProgress(month));
}
