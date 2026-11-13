import { describe, expect, it } from "vitest";
import { recurringCandidates, type RecurringSample } from "@/lib/domain/recurrence";

let n = 0;
const tx = (description: string, amount: number, date: string, counterpartyName: string | null = null): RecurringSample => ({
  id: String(++n),
  description,
  counterpartyName,
  amount,
  date: new Date(`${date}T12:00:00`),
  categoryId: null,
});
const monthly = (description: string, amount: number, counterpartyName: string | null = null) =>
  ["2026-07-10", "2026-08-10", "2026-09-10"].map((d) => tx(description, amount, d, counterpartyName));

describe("recurringCandidates", () => {
  it("keeps two bills paid by boleto apart and names each by its payee", () => {
    const found = recurringCandidates(
      [...monthly("Bankslip", -488.58, "Condominio Edificio Antares"), ...monthly("Bankslip", -2278.63, "PJBank Aluguel")],
      new Set()
    );
    expect(found.map((c) => c.name).sort()).toEqual(["Condominio Edificio Antares", "PJBank Aluguel"]);
    expect(found.every((c) => c.cadence === "MONTHLY")).toBe(true);
  });

  it("names a merchant by its own description", () => {
    const [found] = recurringCandidates(monthly("Google Youtube", -26.9), new Set());
    expect(found!.name).toBe("Google Youtube");
    expect(found!.avgAmount).toBeCloseTo(-26.9);
  });

  it("leaves out a place visited at irregular dates", () => {
    const visits = ["2026-07-02", "2026-07-09", "2026-08-30"].map((d) => tx("Restaurante Sabor", -60, d));
    expect(recurringCandidates(visits, new Set())).toEqual([]);
  });

  it("leaves out a merchant whose amount changes too much", () => {
    const orders = [-20, -95, -41].map((a, i) => tx("Padaria Central", a, ["2026-07-10", "2026-08-10", "2026-09-10"][i]!));
    expect(recurringCandidates(orders, new Set())).toEqual([]);
  });

  it("skips merchants that already have a recurring", () => {
    expect(recurringCandidates(monthly("Google Youtube", -26.9), new Set(["google youtube"]))).toEqual([]);
  });
});
