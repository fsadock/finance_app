import { describe, it, expect } from "vitest";
import { buildInstallmentPlans, committedByMonth, groupInstallmentPurchases, planInstallmentRedates, type InstallmentTx } from "@/lib/domain/installments";

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
  it("keeps one entry for a plan the bank sent up front with each installment's own date as purchase date", () => {
    // Amazon Prime on Nubank: 1/12 charged 05/08, 3/12…12/12 already sent with future dates, 2/12 not yet synced.
    const prime = [1, ...Array.from({ length: 10 }, (_, i) => i + 3)].map((n) => {
      const date = day(2026, 7 + n, 5);
      return tx({ description: `Amazon Prime ${n}/12`, amount: -13.9, installmentNumber: n, date, purchaseDate: date });
    });
    const plans = buildInstallmentPlans(prime, day(2026, 9, 21));
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ paid: 1, remaining: 11, purchaseMonth: "2026-08", endMonth: "2027-07" });
    expect(plans[0]!.remainingAmount).toBeCloseTo(152.9);
  });

  it("projects a plan whose installments are all still in the future", () => {
    const future = [2, 3].map((n) => tx({ installmentNumber: n, totalInstallments: 3, date: day(2026, 8 + n, 10) }));
    expect(buildInstallmentPlans(future, day(2026, 9, 21))[0]).toMatchObject({ paid: 1, remaining: 2, purchaseMonth: "2026-09" });
  });

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

describe("installment purchases (real Nubank cases)", () => {
  // Amazon 5x: the first installment carries the rounding (77,32, the rest 77,29). The connector sent each
  // installment's own date as its purchase date, and 3/5–5/5 had been wrongly pushed two months ahead.
  const amazon = [
    tx({ id: "a1", description: "Amazon 1/5", amount: -77.32, installmentNumber: 1, totalInstallments: 5, date: day(2026, 8, 2), purchaseDate: day(2026, 8, 2) }),
    tx({ id: "a3", description: "Amazon 3/5", amount: -77.29, installmentNumber: 3, totalInstallments: 5, date: day(2026, 12, 3), purchaseDate: day(2026, 10, 3) }),
    tx({ id: "a4", description: "Amazon 4/5", amount: -77.29, installmentNumber: 4, totalInstallments: 5, date: day(2027, 1, 3), purchaseDate: day(2026, 11, 3) }),
    tx({ id: "a5", description: "Amazon 5/5", amount: -77.29, installmentNumber: 5, totalInstallments: 5, date: day(2027, 2, 3), purchaseDate: day(2026, 12, 3) }),
  ];

  it("groups a purchase whose first installment has different cents", () => {
    expect(groupInstallmentPurchases(amazon)).toHaveLength(1);
  });

  it("moves wrongly shifted installments back to their month", () => {
    expect(planInstallmentRedates(amazon)).toEqual([
      { id: "a3", date: day(2026, 10, 2) },
      { id: "a4", date: day(2026, 11, 2) },
      { id: "a5", date: day(2026, 12, 2) },
    ]);
  });

  it("finds the purchase even without installment 1, from each installment's own date", () => {
    const withoutFirst = amazon.slice(1).map((t) => ({ ...t, date: t.purchaseDate! }));
    expect(planInstallmentRedates(withoutFirst)).toEqual([]);
  });

  it("anchors on installment 1 when a later one carries its own date (Amazonmktplc 2x)", () => {
    const mktplc = [
      tx({ id: "m1", description: "Amazonmktplc 1/2", amount: -145.91, installmentNumber: 1, totalInstallments: 2, date: day(2026, 8, 17), purchaseDate: null }),
      tx({ id: "m2", description: "Amazonmktplc 2/2", amount: -145.91, installmentNumber: 2, totalInstallments: 2, date: day(2026, 9, 17), purchaseDate: day(2026, 9, 16) }),
    ];
    expect(planInstallmentRedates(mktplc)).toEqual([]);
  });

  it("repairs a second installment the old rule pushed a month ahead (Rd Saude 2x)", () => {
    const rd = [
      tx({ id: "r1", description: "Rd Saude Online 1/2", amount: -152.61, installmentNumber: 1, totalInstallments: 2, date: day(2026, 8, 22), purchaseDate: null }),
      tx({ id: "r2", description: "Rd Saude Online 2/2", amount: -152.6, installmentNumber: 2, totalInstallments: 2, date: day(2026, 10, 21), purchaseDate: day(2026, 9, 21) }),
    ];
    expect(planInstallmentRedates(rd)).toEqual([{ id: "r2", date: day(2026, 9, 22) }]);
  });

  it("leaves a lone installment with an ambiguous purchase date alone", () => {
    const lone = [tx({ id: "l", installmentNumber: 3, totalInstallments: 5, date: day(2026, 12, 3), purchaseDate: day(2026, 10, 3) })];
    expect(planInstallmentRedates(lone)).toEqual([]);
  });

  it("keeps two similar purchases apart (Araujo Loja: two 3x purchases, both on 2/3)", () => {
    const araujo = [
      tx({ id: "x", description: "Araujo Loja 2/3", amount: -101.34, installmentNumber: 2, totalInstallments: 3 }),
      tx({ id: "y", description: "Araujo Loja 2/3", amount: -101.33, installmentNumber: 2, totalInstallments: 3 }),
    ];
    expect(groupInstallmentPurchases(araujo)).toHaveLength(2);
  });

  it("shows one plan per purchase after the dates are fixed", () => {
    const fixed = amazon.map((t) => {
      const redate = planInstallmentRedates(amazon).find((r) => r.id === t.id);
      return redate ? { ...t, date: redate.date } : t;
    });
    const plans = buildInstallmentPlans(fixed, day(2026, 9, 21));
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ paid: 1, remaining: 4, purchaseMonth: "2026-08", endMonth: "2026-12" });
  });
});

