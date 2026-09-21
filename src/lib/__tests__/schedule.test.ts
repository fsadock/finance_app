import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/infra/db", () => ({ prisma: {} }));

import { nextOccurrence, inferCadence, isLikelyInactive, shiftByCadence } from "@/lib/domain/recurrence";
import { resolveBillingCycle, cycleContaining } from "@/lib/domain/billing";
import { limitInEffect, effectiveWithRollover } from "@/lib/domain/budgets";
import { parseDateInput, lastMonthKeys, formatMonthKeyLong } from "@/lib/domain/format";
import { buildTransactionWhere, futureTransactionsWhere } from "@/lib/data/transaction-filters";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("recurrence", () => {
  it("keeps the anchor when it is already in the future", () => {
    expect(nextOccurrence(day(2026, 10, 5), "MONTHLY", day(2026, 9, 15))).toEqual(day(2026, 10, 5));
  });

  it("rolls a stale monthly date forward to the next occurrence", () => {
    expect(nextOccurrence(day(2026, 3, 10), "MONTHLY", day(2026, 9, 15))).toEqual(day(2026, 10, 10));
  });

  it("returns today when an occurrence lands on today", () => {
    expect(nextOccurrence(day(2026, 8, 15), "MONTHLY", day(2026, 9, 15))).toEqual(day(2026, 9, 15));
  });

  it("does not drift on month-end anchors", () => {
    expect(shiftByCadence(day(2026, 1, 31), "MONTHLY", 3)).toEqual(day(2026, 4, 30));
    expect(nextOccurrence(day(2026, 1, 31), "MONTHLY", day(2026, 3, 2))).toEqual(day(2026, 3, 31));
  });

  it("handles weekly and yearly cadences", () => {
    expect(nextOccurrence(day(2026, 9, 1), "WEEKLY", day(2026, 9, 15))).toEqual(day(2026, 9, 15));
    expect(nextOccurrence(day(2024, 2, 29), "YEARLY", day(2026, 9, 15))).toEqual(day(2027, 2, 28));
  });

  it("infers cadence from occurrence dates", () => {
    expect(inferCadence([day(2026, 1, 5), day(2026, 2, 5), day(2026, 3, 6), day(2026, 4, 5)])).toBe("MONTHLY");
    expect(inferCadence([day(2026, 1, 1), day(2026, 1, 8), day(2026, 1, 15)])).toBe("WEEKLY");
    expect(inferCadence([day(2026, 1, 1), day(2026, 1, 20)])).toBeNull();
    expect(inferCadence([day(2026, 1, 1)])).toBeNull();
  });

  it("flags subscriptions with no charge for 2+ periods", () => {
    expect(isLikelyInactive(day(2026, 6, 1), "MONTHLY", day(2026, 9, 15))).toBe(true);
    expect(isLikelyInactive(day(2026, 8, 20), "MONTHLY", day(2026, 9, 15))).toBe(false);
    expect(isLikelyInactive(null, "MONTHLY", day(2026, 9, 15))).toBe(false);
  });
});

describe("billing cycle", () => {
  const today = day(2026, 9, 15);

  it("uses the configured close day", () => {
    expect(resolveBillingCycle({ today, closeDay: 13 })).toEqual({
      start: day(2026, 9, 13),
      end: day(2026, 10, 13),
      source: "closeDay",
    });
    expect(resolveBillingCycle({ today, closeDay: 20 })).toMatchObject({ start: day(2026, 8, 20), end: day(2026, 9, 20) });
  });

  it("treats the close day itself as the start of a new cycle", () => {
    expect(resolveBillingCycle({ today: day(2026, 9, 13), closeDay: 13 })).toMatchObject({ start: day(2026, 9, 13) });
  });

  it("rolls Pluggy's close date forward when it is stale", () => {
    expect(resolveBillingCycle({ today, balanceCloseDate: day(2026, 6, 3) })).toMatchObject({
      start: day(2026, 9, 3),
      end: day(2026, 10, 3),
      source: "pluggy",
    });
    expect(resolveBillingCycle({ today, balanceCloseDate: day(2026, 9, 28) })).toMatchObject({
      start: day(2026, 8, 28),
      end: day(2026, 9, 28),
    });
  });

  it("falls back to last bill due date − 7 days", () => {
    expect(resolveBillingCycle({ today, lastBillDueDate: day(2026, 9, 10) })).toMatchObject({
      start: day(2026, 9, 3),
      source: "lastBill",
    });
  });

  it("returns null without any signal", () => {
    expect(resolveBillingCycle({ today })).toBeNull();
  });

  it("always contains today", () => {
    for (let d = 1; d <= 31; d++) {
      const c = cycleContaining(day(2025, 1, d), today);
      expect(c.start <= today && today < c.end).toBe(true);
    }
  });
});

describe("budgets", () => {
  const rows = [
    { categoryId: "c", startMonth: "2026-03", monthlyLimit: 500 },
    { categoryId: "c", startMonth: "2026-07", monthlyLimit: 800 },
    { categoryId: "c", startMonth: "2026-09", monthlyLimit: 0 },
  ];

  it("carries a budget forward until a later row replaces it", () => {
    expect(limitInEffect(rows, "2026-02")).toBe(0);
    expect(limitInEffect(rows, "2026-03")).toBe(500);
    expect(limitInEffect(rows, "2026-06")).toBe(500);
    expect(limitInEffect(rows, "2026-08")).toBe(800);
    expect(limitInEffect(rows, "2026-09")).toBe(0);
  });

  it("rolls leftovers and overspend into following months", () => {
    const keys = ["2026-06", "2026-07", "2026-08"];
    const spent: Record<string, number> = { "2026-06": 0, "2026-07": 300, "2026-08": 0 };
    // Jul: 100 limit; Aug: 100 + (100 - 300) = -100
    expect(effectiveWithRollover(keys, (k) => (k === "2026-06" ? 0 : 100), (k) => spent[k]!)).toBe(-100);
    // no rollover history: effective = limit of the evaluated month
    expect(effectiveWithRollover(keys, (k) => (k === "2026-08" ? 250 : 0), () => 999)).toBe(250);
  });
});

describe("dates", () => {
  it("parses date inputs as local midnight", () => {
    const d = parseDateInput("2026-09-01")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 1, 0]);
    expect(parseDateInput("garbage")).toBeNull();
  });

  it("builds month keys across a year boundary", () => {
    expect(lastMonthKeys(3, day(2026, 1, 20))).toEqual(["2025-11", "2025-12", "2026-01"]);
  });

  it("labels month keys in local time", () => {
    expect(formatMonthKeyLong("2026-09")).toContain("setembro");
  });
});

describe("transaction filters", () => {
  it("makes `to` inclusive of the whole day", () => {
    const where = buildTransactionWhere({ from: "2026-09-01", to: "2026-09-10" });
    expect(where).toEqual({ AND: [{ date: { gte: day(2026, 9, 1), lt: day(2026, 9, 11) } }] });
  });

  it("applies every status, not just REVIEW", () => {
    const today = day(2026, 9, 21);
    const upToToday = { date: { lt: day(2026, 9, 22) } };
    expect(buildTransactionWhere({ status: "POSTED" }, today)).toEqual({ AND: [{ status: "POSTED" }, upToToday] });
    expect(buildTransactionWhere({ status: "bogus" }, today)).toEqual({ AND: [upToToday] });
  });

  it("stops at today: installments dated in the future stay on the Parcelas page", () => {
    const today = day(2026, 9, 21);
    expect(buildTransactionWhere({}, today)).toEqual({ AND: [{ date: { lt: day(2026, 9, 22) } }] });
    expect(buildTransactionWhere({ month: "2026-09" }, today)).toEqual({ AND: [{ date: { gte: day(2026, 9, 1), lt: day(2026, 9, 22) } }] });
    expect(buildTransactionWhere({ month: "2026-08" }, today)).toEqual({ AND: [{ date: { gte: day(2026, 8, 1), lt: day(2026, 9, 1) } }] });
    expect(futureTransactionsWhere({ account: "nu" }, today)).toEqual({ AND: [{ accountId: "nu" }, { date: { gte: day(2026, 9, 22) } }] });
  });

  it("shows the future when a date range asks for it", () => {
    const today = day(2026, 9, 21);
    expect(buildTransactionWhere({ from: "2026-10-01" }, today)).toEqual({ AND: [{ date: { gte: day(2026, 10, 1) } }] });
    expect(futureTransactionsWhere({ from: "2026-10-01" }, today)).toBeNull();
  });

  it("supports uncategorized filter and multi-field search", () => {
    const where = buildTransactionWhere({ cat: "none", q: " uber " }, day(2026, 9, 21));
    expect(where.AND).toEqual([
      { categoryId: null },
      { OR: [{ description: { contains: "uber" } }, { merchantRaw: { contains: "uber" } }, { notes: { contains: "uber" } }] },
      { date: { lt: day(2026, 9, 22) } },
    ]);
  });

  it("explicit date range wins over month", () => {
    const where = buildTransactionWhere({ month: "2026-01", from: "2026-09-01" });
    expect(where).toEqual({ AND: [{ date: { gte: day(2026, 9, 1) } }] });
  });
});
