import { describe, expect, it } from "vitest";
import { dateOnly } from "@/lib/domain/format";
import { cycleContaining, missingClosedBill } from "@/lib/domain/billing";
import { dateOnlyDuplicates } from "@/lib/domain/duplicates";

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe("dateOnly", () => {
  it("keeps the calendar day of a UTC-midnight value (Pluggy due dates)", () => {
    expect(dateOnly("2026-08-20T00:00:00.000Z")).toEqual(d(2026, 8, 20));
    expect(dateOnly("2026-08-20")).toEqual(d(2026, 8, 20));
  });
});

describe("missingClosedBill", () => {
  // Nubank: last bill Pluggy sent is due 20/08; the September bill closed ~13/09 and hasn't arrived.
  const cycle = cycleContaining(d(2026, 8, 13), d(2026, 9, 19));

  it("flags the bill that closed when the current cycle started", () => {
    expect(cycle.start).toEqual(d(2026, 9, 13));
    expect(missingClosedBill(d(2026, 8, 20), cycle.start)).toEqual({ closedOn: d(2026, 9, 13), dueOn: d(2026, 9, 20) });
  });

  it("is quiet once the bill arrives or when there are no bills", () => {
    const next = cycleContaining(d(2026, 9, 14), d(2026, 9, 19));
    expect(missingClosedBill(d(2026, 9, 21), next.start)).toBeNull();
    expect(missingClosedBill(null, cycle.start)).toBeNull();
  });
});

describe("dateOnlyDuplicates", () => {
  const tx = (date: Date, amount = 2383.73, description = "Pagamento recebido") => ({ accountId: "nu", date, amount, description });

  it("drops the date-only copy of a card payment sent twice", () => {
    const dateOnlyCopy = tx(d(2026, 8, 19));
    const timed = tx(d(2026, 8, 19, 20, 33));
    expect(dateOnlyDuplicates([dateOnlyCopy, timed])).toEqual([dateOnlyCopy]);
  });

  it("keeps identical purchases that both have a time (two Uber rides)", () => {
    expect(dateOnlyDuplicates([tx(d(2026, 8, 6, 8, 44), -12.9, "Uber"), tx(d(2026, 8, 6, 20, 8), -12.9, "Uber")])).toEqual([]);
  });

  it("keeps a date-only transaction with no timed twin", () => {
    expect(dateOnlyDuplicates([tx(d(2026, 8, 19)), tx(d(2026, 8, 20, 10, 0))])).toEqual([]);
  });
});
