import { describe, it, expect } from "vitest";
import { buildInstallmentPlans, committedByMonth, type InstallmentTx } from "@/lib/domain/installments";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const today = day(2026, 9, 15);

const tx = (over: Partial<InstallmentTx>): InstallmentTx => ({
  id: Math.random().toString(36),
  accountId: "card",
  accountName: "Nubank",
  description: "MAGALU PARC 03/12",
  merchantName: null,
  amount: -100,
  date: day(2026, 9, 5),
  installmentNumber: 3,
  totalInstallments: 12,
  purchaseAmount: null,
  purchaseDate: null,
  ...over,
});

describe("buildInstallmentPlans", () => {
  it("groups installments of the same purchase and projects the rest", () => {
    const plans = buildInstallmentPlans(
      [
        tx({ installmentNumber: 1, date: day(2026, 7, 5), description: "MAGALU PARC 01/12" }),
        tx({ installmentNumber: 2, date: day(2026, 8, 5), description: "MAGALU PARC 02/12" }),
        tx({ installmentNumber: 3, date: day(2026, 9, 5) }),
      ],
      today
    );
    expect(plans).toHaveLength(1);
    const p = plans[0]!;
    expect(p.paid).toBe(3);
    expect(p.remaining).toBe(9);
    expect(p.remainingAmount).toBe(900);
    expect(p.total).toBe(1200);
    expect(p.purchaseMonth).toBe("2026-07");
    expect(p.endMonth).toBe("2027-06");
    expect(p.label).toBe("MAGALU");
    expect([...p.schedule.keys()][0]).toBe("2026-10");
  });

  it("keeps two different purchases at the same merchant apart", () => {
    const plans = buildInstallmentPlans(
      [tx({ amount: -100 }), tx({ amount: -250, installmentNumber: 1, totalInstallments: 3 })],
      today
    );
    expect(plans).toHaveLength(2);
  });

  it("treats missing past installments as paid", () => {
    // last synced installment was 3/6 back in June; Jul–Aug should have posted already
    const [p] = buildInstallmentPlans(
      [tx({ installmentNumber: 3, totalInstallments: 6, date: day(2026, 6, 5) })],
      today
    );
    expect(p!.paid).toBe(5);
    expect([...p!.schedule.keys()]).toEqual(["2026-09"]);
    expect(buildInstallmentPlans([tx({ installmentNumber: 3, totalInstallments: 4, date: day(2026, 6, 5) })], today)).toHaveLength(0);
  });

  it("drops finished purchases and ignores refunds", () => {
    expect(buildInstallmentPlans([tx({ installmentNumber: 12, totalInstallments: 12 })], today)).toHaveLength(0);
    expect(buildInstallmentPlans([tx({ amount: 100 })], today)).toHaveLength(0);
  });

  it("prefers Pluggy purchase data when present", () => {
    const [p] = buildInstallmentPlans([tx({ purchaseAmount: 1199.9, merchantName: "Magazine Luiza" })], today);
    expect(p!.total).toBe(1199.9);
    expect(p!.label).toBe("Magazine Luiza");
  });
});

describe("committedByMonth", () => {
  it("sums what every plan still charges per month", () => {
    const plans = buildInstallmentPlans(
      [tx({ installmentNumber: 10, totalInstallments: 12 }), tx({ amount: -50, installmentNumber: 1, totalInstallments: 2, description: "ZARA 01/02" })],
      today
    );
    expect(committedByMonth(plans, 4, today)).toEqual([
      { month: "2026-09", total: 0 },
      { month: "2026-10", total: 150 },
      { month: "2026-11", total: 100 },
      { month: "2026-12", total: 0 },
    ]);
  });
});
