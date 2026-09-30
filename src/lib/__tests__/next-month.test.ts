import { describe, expect, it } from "vitest";
import { judgeLimit, median, monthOutlook } from "@/lib/domain/next-month";

describe("median", () => {
  it("ignores a single outlier month", () => {
    expect(median([300, 320, 310, 2800, 305])).toBe(310);
  });

  it("averages the middle two when the run is even", () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });

  it("is zero without history", () => {
    expect(median([])).toBe(0);
  });
});

describe("judgeLimit", () => {
  /** The real case: Delivery capped at R$ 120 while every month lands near R$ 900. */
  it("calls a limit too low when the months keep passing it", () => {
    const { verdict, suggested } = judgeLimit(120, [880, 910, 870, 990, 900, 860]);
    expect(verdict).toBe("low");
    expect(suggested).toBe(890); // mediana dos seis meses, nao a media
  });

  it("calls a limit too high when it never says stop", () => {
    expect(judgeLimit(1000, [180, 210, 190, 200]).verdict).toBe("high");
  });

  it("leaves a limit alone when spending sits near it", () => {
    expect(judgeLimit(500, [480, 510, 495, 505]).verdict).toBe("ok");
  });

  it("says nothing when being wrong costs almost nothing", () => {
    // R$ 20 typical against a R$ 50 limit is proportionally far off but not worth a decision.
    expect(judgeLimit(50, [20, 22, 18]).verdict).toBe("ok");
  });

  it("rounds the suggestion to something a person would type", () => {
    expect(judgeLimit(100, [873, 881, 877]).suggested).toBe(880);
  });
});

describe("monthOutlook", () => {
  it("counts what is committed before the month starts", () => {
    const o = monthOutlook({ installments: 1208, recurrings: 642 }, 12000);
    expect(o.total).toBe(1850);
    expect(o.left).toBe(10150);
    expect(o.share).toBeCloseTo(0.154, 3);
  });

  it("admits a month that starts in the red", () => {
    expect(monthOutlook({ installments: 4000, recurrings: 1200 }, 5000).left).toBe(-200);
  });

  it("does not divide by an income nobody has", () => {
    expect(monthOutlook({ installments: 100, recurrings: 0 }, 0).share).toBe(0);
  });
});
