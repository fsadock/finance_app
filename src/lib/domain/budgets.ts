// Budget rules: carry-forward limits, rollover and rebalancing. Pure — no database.

export type BudgetRow = { categoryId: string; startMonth: string; monthlyLimit: number };

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

export type RebalanceSuggestion = { fromId: string; fromName: string; toId: string; toName: string; amount: number };

/** Moves leftover budget from categories under their limit to the ones over it, largest first. */
export function planRebalance(budgets: { category: { id: string; name: string }; limit: number; spent: number }[]): RebalanceSuggestion[] {
  const surplus = budgets
    .filter((b) => b.spent < b.limit)
    .map((b) => ({ id: b.category.id, name: b.category.name, available: b.limit - b.spent }))
    .sort((a, b) => b.available - a.available);
  const deficits = budgets
    .filter((b) => b.spent > b.limit)
    .map((b) => ({ id: b.category.id, name: b.category.name, needed: b.spent - b.limit }))
    .sort((a, b) => b.needed - a.needed);

  const suggestions: RebalanceSuggestion[] = [];
  let s = 0;
  let d = 0;
  while (s < surplus.length && d < deficits.length) {
    const from = surplus[s]!;
    const to = deficits[d]!;
    const move = Math.min(from.available, to.needed);
    if (move > 1) {
      suggestions.push({ fromId: from.id, fromName: from.name, toId: to.id, toName: to.name, amount: Math.round(move * 100) / 100 });
    }
    from.available -= move;
    to.needed -= move;
    if (from.available <= 0) s++;
    if (to.needed <= 0) d++;
  }
  return suggestions;
}
