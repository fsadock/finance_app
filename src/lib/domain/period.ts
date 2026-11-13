import { formatMonthKeyLong, localDayKey, monthKey, monthKeyToDate } from "@/lib/domain/format";

type Period = { year: number; month: number; date: Date; key: string };

function periodOf(date: Date): Period {
  return { year: date.getFullYear(), month: date.getMonth() + 1, date, key: monthKey(date) };
}

export function parsePeriod(value: string | undefined | null): Period {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    if (m! >= 1 && m! <= 12) return periodOf(new Date(y!, m! - 1, 1));
  }
  const now = new Date();
  return periodOf(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function formatPeriodLabel(p: Period) {
  const label = formatMonthKeyLong(p.key);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftPeriod(p: Period, deltaMonths: number): Period {
  return periodOf(new Date(p.year, p.month - 1 + deltaMonths, 1));
}

/**
 * Query for the transactions list covering a whole month, charges dated ahead included.
 *
 * The list stops at today by design — card instalments the bank already sent belong on Parcelas, not in
 * history — and only an explicit range asks for them. But a category total counts the whole month, so a
 * link built from `month` alone sends someone from a number to an empty page. The range is what makes the
 * list show the same month the number was adding up.
 */
export function monthRangeQuery(key: string) {
  const start = monthKeyToDate(key);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  return `from=${localDayKey(start)}&to=${localDayKey(end)}`;
}
