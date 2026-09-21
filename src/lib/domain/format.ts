const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Milliseconds in a day, for elapsed-time math (use date-fns for calendar days). */
export const DAY_MS = 86_400_000;

export function formatBRL(value: number) {
  return BRL.format(value);
}

export function formatBRLCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return formatBRL(value);
}

/** "05 de jul." — with the year ("05 de jul. de 27") when it isn't the current one. */
export function formatDate(d: Date | string, today = new Date()) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "2-digit" } : {}),
  }).format(date);
}

export function formatDateTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMonthLong(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

/** Short month label like "set. de 26". */
export function formatMonthShort(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(d);
}

/** "YYYY-MM" key → short label like "set. de 26". Parses in local time (never via `new Date("YYYY-MM-01")`, which is UTC). */
export function formatMonthKeyShort(key: string) {
  return formatMonthShort(monthKeyToDate(key));
}

/** A date-only API value ("2026-08-20" or "2026-08-20T00:00:00Z") as local midnight of that calendar day. */
export function dateOnly(value: string | Date) {
  const d = new Date(value);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** "18/09" */
export function formatDayMonth(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "18/09/2026" */
export function formatDateNumeric(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/** "YYYY-MM" key → long label like "setembro de 2026". */
export function formatMonthKeyLong(key: string) {
  return formatMonthLong(monthKeyToDate(key));
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyToDate(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, 1);
}

export function monthBounds(d = new Date()) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { start, end };
}

/** Month keys oldest→newest, ending at `anchor`'s month. */
export function lastMonthKeys(count: number, anchor = new Date()) {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(anchor.getFullYear(), anchor.getMonth() - i, 1)));
  }
  return keys;
}

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function localDayKey(d: Date) {
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Parses an `<input type="date">` value ("YYYY-MM-DD") as local midnight.
 * `new Date("YYYY-MM-DD")` is UTC midnight, which is the previous day in Brazil.
 */
export function parseDateInput(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateInput(d: Date) {
  return localDayKey(d);
}
