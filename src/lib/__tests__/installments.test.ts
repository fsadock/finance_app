import { describe, it, expect } from "vitest";
import { buildInstallmentPlans, committedByMonth, groupInstallmentPurchases, type InstallmentTx } from "@/lib/domain/installments";

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
      { today }
    );
    expect(plans).toHaveLength(1);
    const p = plans[0]!;
    // 3/12 was charged on 05/09, in the bill that hasn't closed yet: still to pay
    expect(p.paid).toBe(2);
    expect(p.remaining).toBe(10);
    expect(p.remainingAmount).toBe(1000);
    expect(p.total).toBe(1200);
    expect(p.purchaseMonth).toBe("2026-07");
    expect(p.endMonth).toBe("2027-06");
    expect(p.label).toBe("MAGALU");
    expect([...p.schedule.keys()][0]).toBe("2026-09");
  });

  it("keeps two different purchases at the same merchant apart", () => {
    const plans = buildInstallmentPlans(
      [tx({ amount: -100 }), tx({ amount: -250, installmentNumber: 1, totalInstallments: 3 })],
      { today }
    );
    expect(plans).toHaveLength(2);
  });

  it("treats missing past installments as paid", () => {
    // last synced installment was 3/6 back in June; Jul–Aug should have posted already
    const [p] = buildInstallmentPlans(
      [tx({ installmentNumber: 3, totalInstallments: 6, date: day(2026, 6, 5) })],
      { today }
    );
    expect(p!.paid).toBe(5);
    expect([...p!.schedule.keys()]).toEqual(["2026-09"]);
    expect(buildInstallmentPlans([tx({ installmentNumber: 3, totalInstallments: 4, date: day(2026, 6, 5) })], { today })).toHaveLength(0);
  });

  it("drops finished purchases and ignores refunds", () => {
    expect(buildInstallmentPlans([tx({ installmentNumber: 12, totalInstallments: 12, date: day(2026, 8, 5) })], { today })).toHaveLength(0);
    expect(buildInstallmentPlans([tx({ amount: 100 })], { today })).toHaveLength(0);
  });

  it("prefers Pluggy purchase data when present", () => {
    const [p] = buildInstallmentPlans([tx({ purchaseAmount: 1199.9, merchantName: "Magazine Luiza" })], { today });
    expect(p!.total).toBe(1199.9);
    expect(p!.label).toBe("Magazine Luiza");
  });
});

describe("committedByMonth", () => {
  it("sums what every plan still charges per month", () => {
    const plans = buildInstallmentPlans(
      [tx({ installmentNumber: 10, totalInstallments: 12 }), tx({ amount: -50, installmentNumber: 1, totalInstallments: 2, description: "ZARA 01/02" })],
      { today }
    );
    expect(committedByMonth(plans, 4, today)).toEqual([
      { month: "2026-09", total: 150 },
      { month: "2026-10", total: 150 },
      { month: "2026-11", total: 100 },
      { month: "2026-12", total: 0 },
    ]);
  });
});

describe("installment purchases (real Nubank cases, dates as Open Finance sent them)", () => {
  // Amazon 5x: the first installment carries the rounding (77,32, the rest 77,29) and each installment
  // arrives with its own date as its purchase date. 2/5 hasn't been synced yet.
  const amazon = [
    tx({ description: "Amazon 1/5", amount: -77.32, installmentNumber: 1, totalInstallments: 5, date: day(2026, 8, 2), purchaseDate: day(2026, 8, 2) }),
    tx({ description: "Amazon 3/5", amount: -77.29, installmentNumber: 3, totalInstallments: 5, date: day(2026, 10, 3), purchaseDate: day(2026, 10, 3) }),
    tx({ description: "Amazon 4/5", amount: -77.29, installmentNumber: 4, totalInstallments: 5, date: day(2026, 11, 3), purchaseDate: day(2026, 11, 3) }),
    tx({ description: "Amazon 5/5", amount: -77.29, installmentNumber: 5, totalInstallments: 5, date: day(2026, 12, 3), purchaseDate: day(2026, 12, 3) }),
  ];

  it("groups a purchase whose first installment has different cents", () => {
    expect(groupInstallmentPurchases(amazon)).toHaveLength(1);
  });

  it("shows one plan per purchase", () => {
    const plans = buildInstallmentPlans(amazon, { today: day(2026, 9, 21) });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ paid: 1, remaining: 4, purchaseMonth: "2026-08", endMonth: "2026-12" });
  });

  it("finds the purchase month without installment 1, from each installment's own date", () => {
    expect(buildInstallmentPlans(amazon.slice(1), { today: day(2026, 9, 21) })[0]).toMatchObject({ purchaseMonth: "2026-08" });
  });

  // Nubank's open bill started on 13/09: installments charged before it are in closed bills.
  const nubank = { today: day(2026, 9, 21), openBillStarts: new Map([["card", day(2026, 9, 13)]]) };

  it("counts like the bank: Amazon Prime 12x is 2 settled, 10 to pay (R$ 139,00)", () => {
    // Pluggy sent 1/12 (05/08) and 3/12…12/12 up front; 2/12 is in the closed September bill, not synced yet.
    const prime = [1, ...Array.from({ length: 10 }, (_, i) => i + 3)].map((n) => {
      const date = day(2026, 7 + n, 5);
      return tx({ description: `Amazon Prime ${n}/12`, amount: -13.9, installmentNumber: n, date, purchaseDate: date });
    });
    const plans = buildInstallmentPlans(prime, nubank);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ paid: 2, remaining: 10, purchaseMonth: "2026-08", endMonth: "2027-07" });
    expect(plans[0]!.remainingAmount).toBeCloseTo(139);
  });

  it("counts the installment in the closed bill as settled for Amazon 5x too", () => {
    expect(buildInstallmentPlans(amazon, nubank)[0]).toMatchObject({ paid: 2, remaining: 3 });
  });

  it("projects a plan whose installments are all still to come", () => {
    const future = [2, 3].map((n) => tx({ installmentNumber: n, totalInstallments: 3, date: day(2026, 8 + n, 20) }));
    expect(buildInstallmentPlans(future, nubank)[0]).toMatchObject({ paid: 0, remaining: 3, purchaseMonth: "2026-09" });
  });

  it("reads BTG installments dated with the purchase day as charged in their month (Iwannasleepbh 10x)", () => {
    // BTG sent 4/10–6/10 with their real dates and the rest stamped with the purchase date (02/03).
    const real = new Map([[4, day(2026, 6, 14)], [5, day(2026, 7, 14)], [6, day(2026, 8, 14)]]);
    const btg = Array.from({ length: 10 }, (_, i) => i + 1).map((n) =>
      tx({ description: "Iwannasleepbh", amount: -168.3, installmentNumber: n, totalInstallments: 10, date: n === 1 ? day(2026, 3, 1) : (real.get(n) ?? day(2026, 3, 2)), purchaseDate: day(2026, 3, 1) })
    );
    const [p] = buildInstallmentPlans(btg, { today: day(2026, 9, 21), openBillStarts: new Map([["card", day(2026, 9, 17)]]) });
    expect(p).toMatchObject({ paid: 7, remaining: 3, endMonth: "2026-12" });
    expect(p!.remainingAmount).toBeCloseTo(504.9);
  });

  it("keeps two similar purchases apart (Araujo Loja: two 3x purchases, both on 2/3)", () => {
    const araujo = [
      tx({ id: "x", description: "Araujo Loja 2/3", amount: -101.34, installmentNumber: 2, totalInstallments: 3 }),
      tx({ id: "y", description: "Araujo Loja 2/3", amount: -101.33, installmentNumber: 2, totalInstallments: 3 }),
    ];
    expect(groupInstallmentPurchases(araujo)).toHaveLength(2);
  });
});
