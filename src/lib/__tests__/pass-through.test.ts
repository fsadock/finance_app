import { describe, expect, it } from "vitest";
import { amountsCancel, findCounterpart, newPassThroughs, type PassThroughTx } from "@/lib/domain/pass-through";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

const tx = (over: Partial<PassThroughTx> & { id: string }): PassThroughTx => ({
  accountId: "btg",
  description: "Bankslip",
  merchantRaw: null,
  counterpartyName: null,
  amount: -2279,
  chargeDate: day(2026, 9, 15),
  excludeOverride: null,
  ...over,
});

// The real case: every month a boleto of R$ 2.279 leaves the account and a Pix of the same amount arrives to
// pay it. Neither is spending, and neither is income.
const august = [
  tx({ id: "ago-boleto", chargeDate: day(2026, 8, 17), excludeOverride: true }),
  tx({ id: "ago-pix", description: "Pix", amount: 2280, chargeDate: day(2026, 8, 14), excludeOverride: true }),
];
const september = [
  tx({ id: "set-boleto", chargeDate: day(2026, 9, 15) }),
  tx({ id: "set-pix", description: "Pix", amount: 2279, chargeDate: day(2026, 9, 15) }),
];

describe("amountsCancel", () => {
  it("tolerates cents and small differences, not different amounts", () => {
    expect(amountsCancel(-2279, 2280)).toBe(true);
    expect(amountsCancel(-2279, 2279)).toBe(true);
    expect(amountsCancel(-2279, 2774)).toBe(false);
    expect(amountsCancel(-20, 22)).toBe(true); // R$ 5 floor, for small amounts
  });
});

describe("findCounterpart", () => {
  it("finds the money that funds the bill", () => {
    expect(findCounterpart(september[0]!, september)?.id).toBe("set-pix");
  });

  it("ignores another account, another sign and another week", () => {
    const far = tx({ id: "x", description: "Pix", amount: 2279, chargeDate: day(2026, 9, 30) });
    const other = tx({ id: "y", description: "Pix", amount: 2279, accountId: "nubank" });
    const sameSign = tx({ id: "z", amount: -2279 });
    expect(findCounterpart(september[0]!, [far, other, sameSign])).toBeNull();
  });
});

describe("newPassThroughs", () => {
  it("marks next month's bill and what funds it, from the one the owner marked", () => {
    expect(newPassThroughs([...august, ...september]).map((t) => t.id).sort()).toEqual(["set-boleto", "set-pix"]);
  });

  it("does nothing until the owner marks one", () => {
    expect(newPassThroughs(september)).toEqual([]);
  });

  it("leaves other bills of the same kind alone when the amount differs", () => {
    const energia = tx({ id: "energia", amount: -505, chargeDate: day(2026, 9, 5) });
    expect(newPassThroughs([...august, ...september, energia]).some((t) => t.id === "energia")).toBe(false);
  });

  it("leaves a bill of the same amount on another day of the month alone", () => {
    const outro = tx({ id: "outro", chargeDate: day(2026, 9, 2) });
    expect(newPassThroughs([...august, outro]).map((t) => t.id)).not.toContain("outro");
  });

  it("doesn't learn from a bare Pix, which would match any other Pix", () => {
    const marked = [tx({ id: "pix-marcado", description: "Pix", amount: -2279, chargeDate: day(2026, 8, 14), excludeOverride: true })];
    const other = tx({ id: "pix-outro", description: "Pix", amount: -2280, chargeDate: day(2026, 9, 14) });
    expect(newPassThroughs([...marked, other])).toEqual([]);
  });

  it("respects a transaction the owner put back in the budget", () => {
    const back = tx({ id: "set-boleto", excludeOverride: false });
    expect(newPassThroughs([...august, back]).map((t) => t.id)).not.toContain("set-boleto");
  });
});
