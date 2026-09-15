import { addDays, addMonths, differenceInCalendarDays } from "date-fns";
import { startOfDay } from "./format";

export type Cadence = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

export const CADENCE_LABEL: Record<Cadence, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

export const CADENCE_TO_MONTHLY: Record<Cadence, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  YEARLY: 1 / 12,
};

const CADENCE_DAYS: Record<Cadence, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  QUARTERLY: 91,
  YEARLY: 365,
};

/** `anchor` shifted by `n` cadence periods. Month-based cadences are computed from the anchor to avoid 31→28→28 drift. */
export function shiftByCadence(anchor: Date, cadence: Cadence, n: number): Date {
  switch (cadence) {
    case "WEEKLY":
      return addDays(anchor, 7 * n);
    case "BIWEEKLY":
      return addDays(anchor, 14 * n);
    case "MONTHLY":
      return addMonths(anchor, n);
    case "QUARTERLY":
      return addMonths(anchor, 3 * n);
    case "YEARLY":
      return addMonths(anchor, 12 * n);
  }
}

/** First occurrence of the series anchored at `anchor` that falls on or after `onOrAfter` (day precision). */
export function nextOccurrence(anchor: Date, cadence: Cadence, onOrAfter: Date): Date {
  const target = startOfDay(onOrAfter);
  const base = startOfDay(anchor);
  if (base >= target) return base;
  // Jump close to the target, then step forward.
  let n = Math.max(0, Math.floor(differenceInCalendarDays(target, base) / CADENCE_DAYS[cadence]) - 1);
  let d = shiftByCadence(base, cadence, n);
  while (d < target) d = shiftByCadence(base, cadence, ++n);
  return d;
}

/** Infers cadence from occurrence dates using the median gap. Returns null when gaps don't look periodic. */
export function inferCadence(dates: Date[]): Cadence | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(differenceInCalendarDays(sorted[i]!, sorted[i - 1]!));
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  if (median >= 5 && median <= 9) return "WEEKLY";
  if (median >= 12 && median <= 17) return "BIWEEKLY";
  if (median >= 25 && median <= 35) return "MONTHLY";
  if (median >= 80 && median <= 100) return "QUARTERLY";
  if (median >= 350 && median <= 380) return "YEARLY";
  return null;
}

/** True when the last charge is more than ~2 periods old — the subscription was probably cancelled. */
export function isLikelyInactive(lastDate: Date | null, cadence: Cadence, today = new Date()): boolean {
  if (!lastDate) return false;
  return differenceInCalendarDays(today, lastDate) > CADENCE_DAYS[cadence] * 2 + 5;
}
