import { describe, expect, it } from "vitest";
import { matchUnnamedPayments, type LinkCandidate } from "@/lib/domain/recurrence";
import { isUnnamedBillPayment } from "@/lib/domain/merchant";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const BTG = "btg";
const monthlyCharges = (amount: number, day: number, months: [number, number][], accountId = BTG) =>
  months.map(([y, m]) => ({ date: d(y, m, day), amount, accountId }));

// Claro paid on the 15th every month except March 2026, when BTG sent "Utilities" with no payee.
const CLARO: LinkCandidate = {
  id: "claro",
  amount: -127.9,
  cadence: "MONTHLY",
  charges: monthlyCharges(-127.9, 15, [[2026, 1], [2026, 2], [2026, 4], [2026, 5]]),
};
// Energy around the 23rd, February missing.
const ENERGIA: LinkCandidate = {
  id: "energia",
  amount: -84.09,
  cadence: "MONTHLY",
  charges: monthlyCharges(-79.5, 23, [[2026, 1], [2026, 3], [2026, 4]]),
};
// Solar consortium, already paid on 23/02 — a similar amount must not be linked to it again.
const SOLAR: LinkCandidate = {
  id: "solar",
  amount: -70.34,
  cadence: "MONTHLY",
  charges: [...monthlyCharges(-77.21, 23, [[2026, 2]]), ...monthlyCharges(-96.56, 27, [[2026, 3]])],
};

const pay = (id: string, y: number, m: number, day: number, amount: number, accountId = BTG) => ({ id, date: d(y, m, day), amount, accountId });

describe("isUnnamedBillPayment", () => {
  it("recognizes bill payments without a payee", () => {
    expect(isUnnamedBillPayment({ description: "Utilities", counterpartyName: null })).toBe(true);
    expect(isUnnamedBillPayment({ description: "Bankslip", counterpartyName: "" })).toBe(true);
  });
  it("leaves named payments and Pix alone", () => {
    expect(isUnnamedBillPayment({ description: "Bankslip", counterpartyName: "CLARO S.A." })).toBe(false);
    expect(isUnnamedBillPayment({ description: "Pix", counterpartyName: null })).toBe(false);
  });
});

describe("matchUnnamedPayments", () => {
  const all = [CLARO, ENERGIA, SOLAR];

  it("links the Claro and energy payments from the real data", () => {
    const result = matchUnnamedPayments([pay("u1", 2026, 3, 15, -127.9), pay("u2", 2026, 2, 22, -78.53)], all);
    expect(result).toEqual(new Map([["u1", "claro"], ["u2", "energia"]]));
  });

  it("does not link to a month that already has a charge", () => {
    expect(matchUnnamedPayments([pay("u", 2026, 4, 14, -127.9)], all).size).toBe(0);
  });

  it("requires the usual day", () => {
    expect(matchUnnamedPayments([pay("u", 2026, 3, 3, -127.9)], all).size).toBe(0);
  });

  it("requires a close amount", () => {
    expect(matchUnnamedPayments([pay("u", 2026, 3, 15, -160)], all).size).toBe(0);
  });

  it("requires the account the bill is paid from", () => {
    expect(matchUnnamedPayments([pay("u", 2026, 3, 15, -127.9, "nubank")], all).size).toBe(0);
  });

  it("leaves a payment that fits two recurrings unlinked", () => {
    const twin: LinkCandidate = { ...CLARO, id: "twin" };
    expect(matchUnnamedPayments([pay("u", 2026, 3, 15, -127.9)], [CLARO, twin]).size).toBe(0);
  });

  it("leaves two payments for the same month unlinked", () => {
    expect(matchUnnamedPayments([pay("a", 2026, 3, 14, -127.9), pay("b", 2026, 3, 16, -127.9)], all).size).toBe(0);
  });

  it("wraps around month ends", () => {
    const endOfMonth: LinkCandidate = { id: "eom", amount: -50, cadence: "MONTHLY", charges: monthlyCharges(-50, 30, [[2026, 1], [2026, 4]]) };
    expect(matchUnnamedPayments([pay("u", 2026, 3, 1, -50)], [endOfMonth]).get("u")).toBe("eom");
  });
});
