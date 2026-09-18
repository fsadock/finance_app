import { prisma } from "./db";
import { lastMonthKeys, monthKey, monthKeyToDate } from "./format";
import { FLOW_SELECT, SPEND_WHERE, spendDelta } from "./flows";

/** How many months of history rollover looks back over. */
const ROLLOVER_WINDOW_MONTHS = 6;

type BudgetRow = { categoryId: string; startMonth: string; monthlyLimit: number };

/**
 * A budget row applies from its `startMonth` until a later row for the same category replaces it.
 * Returns the limit in effect for `key` ("YYYY-MM"), or 0 when none.
 * `rows` must be sorted by startMonth ascending.
 */
export function limitInEffect(rows: BudgetRow[], key: string): number {
  let limit = 0;
  for (const r of rows) {
    if (r.startMonth > key) break;
    limit = r.monthlyLimit;
  }
  return limit;
}

/**
 * Effective budget with rollover: each month's leftover (or overspend) carries into the next.
 * `keys` oldest→newest; the last key is the month being evaluated.
 */
export function effectiveWithRollover(
  keys: string[],
  limitFor: (key: string) => number,
  spentFor: (key: string) => number
): number {
  let effective = 0;
  let started = false;
  for (let i = 0; i < keys.length; i++) {
    const limit = limitFor(keys[i]!);
    if (!started) {
      if (limit <= 0 && i < keys.length - 1) continue;
      started = true;
      effective = limit;
      continue;
    }
    effective = limit + (effective - spentFor(keys[i - 1]!));
  }
  return effective;
}

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
    where: { AND: [{ categoryId: { in: categoryIds }, date: { gte: start, lt: end } }, SPEND_WHERE] },
    select: { ...FLOW_SELECT, date: true },
  });
  const out = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (!t.categoryId) continue;
    const k = monthKey(t.date);
    if (!out.has(t.categoryId)) out.set(t.categoryId, new Map());
    const m = out.get(t.categoryId)!;
    m.set(k, (m.get(k) ?? 0) + spendDelta(t));
  }
  return out;
}
