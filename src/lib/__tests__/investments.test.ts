import { describe, expect, it } from "vitest";
import { grossUp } from "@/lib/domain/investments";

describe("grossUp", () => {
  it("adds back what the institution withheld", () => {
    const { net, incomeTax, iof, withheld, gross } = grossUp([
      { value: 100, incomeTax: 10, iof: 1 },
      { value: 50, incomeTax: 5, iof: 0 },
    ]);
    expect({ net, incomeTax, iof, withheld, gross }).toEqual({ net: 150, incomeTax: 15, iof: 1, withheld: 16, gross: 166 });
  });

  it("leaves a portfolio without withholding alone", () => {
    expect(grossUp([{ value: 906, incomeTax: 0, iof: 0 }])).toMatchObject({ net: 906, gross: 906, withheld: 0 });
  });

  /**
   * The real case that started this: the Nubank app showed R$ 45.041,91 in the caixinhas while the app
   * showed R$ 44.547,91 — the R$ 496,23 of income tax Pluggy had already deducted from every balance.
   */
  it("reconciles the caixinhas with what the bank's own app shows", () => {
    const positions = [
      { value: 22390.71, incomeTax: 24.2, iof: 52.96 },
      { value: 9670.55, incomeTax: 312.99, iof: 0 },
      { value: 5250.19, incomeTax: 6.81, iof: 14.9 },
      { value: 5106.46, incomeTax: 83.3, iof: 0 },
      { value: 2106.4, incomeTax: 68.17, iof: 0 },
      { value: 23.6, incomeTax: 0.76, iof: 0 },
    ];
    const { net, incomeTax, gross } = grossUp(positions);
    expect(net).toBeCloseTo(44547.91, 2);
    expect(incomeTax).toBeCloseTo(496.23, 2);
    // Nubank shows the value before income tax but after IOF. The few reais left over are the two days
    // between the position's date at the institution and the screenshot.
    expect(Math.abs(net + incomeTax - 45041.91)).toBeLessThan(3);
    expect(gross).toBeCloseTo(45112.0, 2);
  });
});
