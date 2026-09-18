import { formatDayMonth, localDayKey } from "./format";

/** Adds `value(item)` per local day ("YYYY-MM-DD"). */
export function sumByDay<T extends { date: Date }>(items: T[], value: (item: T) => number) {
  const byDay = new Map<string, number>();
  for (const t of items) {
    const key = localDayKey(t.date);
    byDay.set(key, (byDay.get(key) ?? 0) + value(t));
  }
  return byDay;
}

export type SeriesPoint = { day: number; label: string; actual: number | null; ideal: number | null };

/**
 * Running total per day, starting at `from`, for `days` days — the spending-pace charts.
 * Only days where `counts(day)` is true and that aren't in the future add to (and show) the total;
 * `ideal(day)` is the target line (null hides it). Returns the points and the final total.
 */
export function cumulativeSeries(opts: {
  from: Date;
  days: number;
  today: Date;
  byDay: Map<string, number>;
  initial?: number;
  counts: (day: Date) => boolean;
  ideal: (day: Date) => number | null;
}) {
  const points: SeriesPoint[] = [];
  let total = opts.initial ?? 0;
  for (let i = 0; i < opts.days; i++) {
    const d = new Date(opts.from.getFullYear(), opts.from.getMonth(), opts.from.getDate() + i);
    const active = opts.counts(d) && d <= opts.today;
    if (active) total += opts.byDay.get(localDayKey(d)) ?? 0;
    points.push({ day: i + 1, label: formatDayMonth(d), actual: active ? total : null, ideal: opts.ideal(d) });
  }
  return { points, total };
}
