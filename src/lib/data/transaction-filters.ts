import type { Prisma } from "@/generated/prisma/client";
import { monthBounds, parseDateInput } from "@/lib/domain/format";
import { parsePeriod } from "@/lib/domain/period";

export type TxFilterParams = {
  status?: string | null;
  q?: string | null;
  cat?: string | null;
  account?: string | null;
  tag?: string | null;
  from?: string | null;
  to?: string | null;
  month?: string | null;
  type?: string | null;
};

export const TX_FILTER_KEYS = ["status", "q", "cat", "account", "tag", "from", "to", "month", "type"] as const;

/** Filters other than the period (status, category, account, tag, type, search). */
function attributeFilters(p: TxFilterParams): Prisma.TransactionWhereInput[] {
  const and: Prisma.TransactionWhereInput[] = [];

  if (p.status === "REVIEW" || p.status === "POSTED" || p.status === "PENDING") and.push({ status: p.status });
  if (p.cat === "none") and.push({ categoryId: null });
  else if (p.cat) and.push({ categoryId: p.cat });
  if (p.account) and.push({ accountId: p.account });
  if (p.tag) and.push({ tags: { some: { id: p.tag } } });
  if (p.type === "out") and.push({ amount: { lt: 0 } });
  if (p.type === "in") and.push({ amount: { gt: 0 } });
  if (p.type === "transfer") and.push({ transferPairId: { not: null } });

  const q = p.q?.trim();
  if (q) {
    and.push({
      OR: [{ description: { contains: q } }, { merchantRaw: { contains: q } }, { notes: { contains: q } }],
    });
  }
  return and;
}

const hasExplicitRange = (p: TxFilterParams) => Boolean(parseDateInput(p.from) || parseDateInput(p.to));
const tomorrow = (today: Date) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

/**
 * Single source of truth for transaction filters — used by the list page and the CSV export.
 * The list is history: it stops at today. Card installments the bank already sent with future
 * dates live on the Parcelas page; they only appear here when a from/to range asks for them.
 */
export function buildTransactionWhere(p: TxFilterParams, today = new Date()): Prisma.TransactionWhereInput {
  const and = attributeFilters(p);

  const from = parseDateInput(p.from);
  const to = parseDateInput(p.to);
  if (from || to) {
    const date: Prisma.DateTimeFilter = {};
    if (from) date.gte = from;
    // `to` is inclusive: everything before the next local midnight
    if (to) date.lt = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    and.push({ date });
  } else if (p.month) {
    const { start, end } = monthBounds(parsePeriod(p.month).date);
    const cap = tomorrow(today);
    and.push({ date: { gte: start, lt: end < cap ? end : cap } });
  } else {
    and.push({ date: { lt: tomorrow(today) } });
  }

  return and.length > 0 ? { AND: and } : {};
}

/** The future-dated transactions the list leaves out for these filters, or null when a range includes them. */
export function futureTransactionsWhere(p: TxFilterParams, today = new Date()): Prisma.TransactionWhereInput | null {
  if (hasExplicitRange(p)) return null;
  return { AND: [...attributeFilters(p), { date: { gte: tomorrow(today) } }] };
}

/** Carries the active filters into a URLSearchParams (for pagination/export links). */
export function filtersToSearchParams(p: TxFilterParams, overrides: Record<string, string | null> = {}) {
  const params = new URLSearchParams();
  for (const k of TX_FILTER_KEYS) {
    const v = p[k];
    if (v) params.set(k, v);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  return params;
}
