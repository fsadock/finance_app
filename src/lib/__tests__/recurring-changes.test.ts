import { describe, expect, it } from "vitest";
import { cadenceForGap, chargeEvents, detectRecurringChange, nextDueDate, priceTrend, type Charge } from "@/lib/domain/recurrence";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const c = (y: number, m: number, day: number, amount: number): Charge => ({ date: d(y, m, day), amount });

/** Proton on the card: monthly plan, switch to yearly six days after the third charge, renewal a year later. */
const PROTON = [c(2025, 5, 19, -29.02), c(2025, 6, 19, -29.11), c(2025, 7, 19, -29.13), c(2025, 7, 25, -206.81), c(2026, 8, 20, -38.26)];

const monthly = (amount: number, ...days: [number, number, number][]) => days.map(([y, m, day]) => c(y, m, day, amount));

describe("cadenceForGap", () => {
  it("maps clear gaps to a cadence", () => {
    expect(cadenceForGap(7)).toBe("WEEKLY");
    expect(cadenceForGap(31)).toBe("MONTHLY");
    expect(cadenceForGap(391)).toBe("YEARLY");
  });
  it("returns null for gaps between cadences (a skipped month is not quarterly)", () => {
    expect(cadenceForGap(61)).toBeNull();
    expect(cadenceForGap(200)).toBeNull();
  });
});

describe("chargeEvents", () => {
  it("merges a plan switch days after a charge into the later charge", () => {
    const events = chargeEvents(PROTON, "MONTHLY");
    expect(events.map((e) => e.amount)).toEqual([-29.02, -29.11, -206.81, -38.26]);
  });
  it("keeps weekly charges apart", () => {
    expect(chargeEvents([c(2026, 1, 1, -10), c(2026, 1, 8, -10), c(2026, 1, 15, -10)], "WEEKLY")).toHaveLength(3);
  });
});

describe("detectRecurringChange", () => {
  it("detects that Proton became yearly", () => {
    const change = detectRecurringChange({ cadence: "MONTHLY", amount: -38.26 }, PROTON);
    expect(change).toMatchObject({ cadence: "YEARLY", amount: -38.26, reason: "cadence", gapDays: 391 });
    expect(change?.key).toBe("YEARLY:-38.26:2026-08-20");
  });

  it("is stable once applied", () => {
    expect(detectRecurringChange({ cadence: "YEARLY", amount: -38.26 }, PROTON)).toBeNull();
  });

  it("ignores normal monthly drift", () => {
    const charges = monthly(-55.9, [2026, 5, 3], [2026, 6, 2], [2026, 7, 5], [2026, 8, 3]);
    expect(detectRecurringChange({ cadence: "MONTHLY", amount: -55.9 }, charges)).toBeNull();
  });

  it("does not turn a skipped month into a new cadence", () => {
    const charges = monthly(-55.9, [2026, 5, 3], [2026, 6, 3], [2026, 8, 3]);
    expect(detectRecurringChange({ cadence: "MONTHLY", amount: -55.9 }, charges)).toBeNull();
  });

  it("detects a new price after two charges at it", () => {
    const charges = [...monthly(-39.9, [2026, 4, 10], [2026, 5, 10]), ...monthly(-44.9, [2026, 6, 10], [2026, 7, 10])];
    expect(detectRecurringChange({ cadence: "MONTHLY", amount: -39.9 }, charges)).toMatchObject({
      reason: "amount",
      cadence: "MONTHLY",
      amount: -44.9,
    });
  });

  it("waits for a second charge before changing the price", () => {
    const charges = [...monthly(-39.9, [2026, 4, 10], [2026, 5, 10], [2026, 6, 10]), c(2026, 7, 10, -44.9)];
    expect(detectRecurringChange({ cadence: "MONTHLY", amount: -39.9 }, charges)).toBeNull();
  });

  it("does not chase bills that vary every month", () => {
    const charges = [c(2026, 5, 10, -182.4), c(2026, 6, 10, -205.1), c(2026, 7, 10, -231.7)];
    expect(detectRecurringChange({ cadence: "MONTHLY", amount: -190 }, charges)).toBeNull();
  });

  it("ignores small price changes", () => {
    const charges = monthly(-41, [2026, 5, 10], [2026, 6, 10], [2026, 7, 10]);
    expect(detectRecurringChange({ cadence: "MONTHLY", amount: -39.9 }, charges)).toBeNull();
  });

  it("works for income too", () => {
    const charges = [...monthly(5000, [2026, 5, 5], [2026, 6, 5]), ...monthly(6200, [2026, 7, 5], [2026, 8, 5])];
    expect(detectRecurringChange({ cadence: "MONTHLY", amount: 5000 }, charges)).toMatchObject({ amount: 6200 });
  });
});

describe("priceTrend", () => {
  it("does not compare across plans (Proton monthly → yearly is not +32%)", () => {
    expect(priceTrend(PROTON, "MONTHLY")).toBeNull();
  });

  it("measures the change within the current plan", () => {
    const trend = priceTrend([...monthly(-39.9, [2026, 1, 10], [2026, 2, 10]), ...monthly(-44.9, [2026, 3, 10])], "MONTHLY");
    expect(trend?.first.amount).toBe(-39.9);
    expect(trend?.change).toBeCloseTo(44.9 / 39.9 - 1);
  });

  it("ignores jumps that are plan switches or credits (Proton yearly: R$206,81 → R$38,26)", () => {
    expect(priceTrend(PROTON, "YEARLY")).toBeNull();
  });

  it("needs two charges", () => {
    expect(priceTrend([c(2026, 1, 10, -10)], "MONTHLY")).toBeNull();
  });
});

describe("nextDueDate", () => {
  it("is one period after the last charge", () => {
    expect(nextDueDate(d(2026, 8, 20), "YEARLY", d(2026, 9, 18))).toEqual(d(2027, 8, 20));
  });
  it("never returns a past date", () => {
    expect(nextDueDate(d(2026, 1, 20), "MONTHLY", d(2026, 9, 18))).toEqual(d(2026, 9, 20));
  });
});
