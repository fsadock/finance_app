import { addDays, addMonths, differenceInCalendarDays } from "date-fns";
import { localDayKey, startOfDay } from "@/lib/domain/format";

/** Same values as the RecurringCadence enum in schema.prisma (checked at compile time in actions/recurrings.ts). */
export const CADENCES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type Cadence = (typeof CADENCES)[number];

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

/** Next due date after the last real occurrence (never in the past). */
export function nextDueDate(lastDate: Date, cadence: Cadence, today = new Date()): Date {
  return nextOccurrence(shiftByCadence(lastDate, cadence, 1), cadence, startOfDay(today));
}

export type Charge = { date: Date; amount: number };

/** Whether a gap between two charges is plausible for the cadence (bills drift a few days). */
function fitsCadence(days: number, cadence: Cadence): boolean {
  const ratio = days / CADENCE_DAYS[cadence];
  return ratio >= 0.6 && ratio <= 1.6;
}

/** The cadence a gap clearly belongs to (within ±25%), or null for gaps in between. */
export function cadenceForGap(days: number): Cadence | null {
  let best: Cadence | null = null;
  let bestDistance = Infinity;
  for (const c of Object.keys(CADENCE_DAYS) as Cadence[]) {
    const distance = Math.abs(Math.log(days / CADENCE_DAYS[c]));
    if (distance < bestDistance) [best, bestDistance] = [c, distance];
  }
  return bestDistance <= Math.log(1.25) ? best : null;
}

/**
 * Charges sorted by date, with charges only a few days apart (plan switch, proration, duplicate)
 * merged into the later one — it reflects the plan that continues.
 */
export function chargeEvents(charges: Charge[], cadence: Cadence): Charge[] {
  const window = Math.min(10, CADENCE_DAYS[cadence] * 0.35);
  const events: Charge[] = [];
  for (const c of [...charges].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const prev = events[events.length - 1];
    if (prev && differenceInCalendarDays(c.date, prev.date) < window) events[events.length - 1] = c;
    else events.push(c);
  }
  return events;
}

/**
 * Price change across the latest run of charges spaced like the cadence. Earlier charges belong to
 * another plan (e.g. monthly before switching to yearly) and are not compared. Changes beyond ±60%
 * are plan switches, credits or bundles rather than a price increase, and return null.
 */
export function priceTrend(charges: Charge[], cadence: Cadence): { first: Charge; last: Charge; change: number } | null {
  const events = chargeEvents(charges, cadence);
  if (events.length < 2) return null;
  let i = events.length - 1;
  while (i > 0 && fitsCadence(differenceInCalendarDays(events[i]!.date, events[i - 1]!.date), cadence)) i--;
  const first = events[i]!;
  const last = events[events.length - 1]!;
  if (first === last || first.amount === 0) return null;
  const change = Math.abs(last.amount) / Math.abs(first.amount) - 1;
  return Math.abs(change) <= 0.6 ? { first, last, change } : null;
}

export type RecurringChange = {
  /** Identifies the change, so an undone change isn't applied again. */
  key: string;
  cadence: Cadence;
  amount: number;
  reason: "cadence" | "amount";
  /** Days between the two charges that show the change. */
  gapDays: number;
  lastDate: Date;
};

/**
 * Detects that a recurring changed cadence or price, from its latest charges:
 * - cadence: the last gap doesn't fit the current cadence but clearly fits another (13 months → yearly);
 * - amount: the last two charges agree with each other (±2%) but are >5% away from the saved amount.
 *   Fixed-price subscriptions follow price changes; bills that vary every month (energy) don't flip.
 * `charges` must be this merchant's charges in the recurring's direction.
 */
export function detectRecurringChange(current: { cadence: Cadence; amount: number }, charges: Charge[]): RecurringChange | null {
  const events = chargeEvents(charges, current.cadence);
  if (events.length < 2) return null;
  const last = events[events.length - 1]!;
  const prev = events[events.length - 2]!;
  const gapDays = differenceInCalendarDays(last.date, prev.date);

  let change: Pick<RecurringChange, "cadence" | "amount" | "reason"> | null = null;
  if (!fitsCadence(gapDays, current.cadence)) {
    const cadence = cadenceForGap(gapDays);
    if (cadence && cadence !== current.cadence) change = { cadence, amount: last.amount, reason: "cadence" };
  } else {
    const moved = (a: number) => Math.abs(a / current.amount - 1) > 0.05;
    if (moved(last.amount) && moved(prev.amount) && Math.abs(last.amount / prev.amount - 1) <= 0.02) {
      change = { cadence: current.cadence, amount: last.amount, reason: "amount" };
    }
  }
  if (!change) return null;
  return { ...change, key: `${change.cadence}:${change.amount.toFixed(2)}:${localDayKey(last.date)}`, gapDays, lastDate: last.date };
}

/** What the recurrings page shows after an automatic change, and what "Desfazer" restores. */
export type AutoChangeRecord = {
  key: string;
  reason: RecurringChange["reason"];
  from: { cadence: Cadence; amount: number };
  to: { cadence: Cadence; amount: number };
  gapDays: number;
  at: string;
};

export type LinkCandidate = { id: string; amount: number; cadence: Cadence; charges: (Charge & { accountId: string })[] };

/** Distance between two days of the month, wrapping around month ends (30 → 2 is 3 days). */
function dayDistance(a: number, b: number) {
  const d = Math.abs(a - b);
  return Math.min(d, 31 - d);
}

/**
 * Matches bill payments the bank sent without a payee name to the one monthly recurring each clearly
 * belongs to: same direction and account as its charges, amount within 15% of the saved amount or of
 * its closest charge, paid within 4 days of its usual day, in a period with no charge yet. Ambiguous
 * payments (two candidate recurrings, or two payments for one recurring's month) stay unmatched.
 * Returns payment id → recurring id.
 */
export function matchUnnamedPayments(
  payments: (Charge & { id: string; accountId: string })[],
  recurrings: LinkCandidate[]
): Map<string, string> {
  const close = (a: number, b: number) => b !== 0 && Math.abs(a / b - 1) <= 0.15;
  const tentative = new Map<string, string>();
  for (const p of payments) {
    const ids = recurrings
      .filter((r) => {
        if (r.cadence !== "MONTHLY" || r.charges.length < 2 || Math.sign(p.amount) !== Math.sign(r.amount)) return false;
        if (!r.charges.some((c) => c.accountId === p.accountId)) return false;
        const days = r.charges.map((c) => c.date.getDate()).sort((a, b) => a - b);
        if (dayDistance(p.date.getDate(), days[Math.floor(days.length / 2)]!) > 4) return false;
        const gaps = r.charges.map((c) => Math.abs(differenceInCalendarDays(p.date, c.date)));
        if (Math.min(...gaps) < CADENCE_DAYS.MONTHLY / 2) return false;
        const nearest = r.charges[gaps.indexOf(Math.min(...gaps))]!;
        return close(p.amount, r.amount) || close(p.amount, nearest.amount);
      })
      .map((r) => r.id);
    if (ids.length === 1) tentative.set(p.id, ids[0]!);
  }

  // Two payments for the same recurring within one period: can't tell which is the bill.
  const result = new Map(tentative);
  for (const [pid, rid] of tentative) {
    const p = payments.find((x) => x.id === pid)!;
    const rival = [...tentative].some(
      ([otherId, otherRid]) =>
        otherId !== pid &&
        otherRid === rid &&
        Math.abs(differenceInCalendarDays(p.date, payments.find((x) => x.id === otherId)!.date)) < CADENCE_DAYS.MONTHLY / 2
    );
    if (rival) result.delete(pid);
  }
  return result;
}
