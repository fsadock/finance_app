import { describe, expect, it } from "vitest";
import { monthRangeQuery } from "@/lib/domain/period";

describe("monthRangeQuery", () => {
  it("covers the month end to end", () => {
    expect(monthRangeQuery("2026-10")).toBe("from=2026-10-01&to=2026-10-31");
  });

  it("knows how long each month is", () => {
    expect(monthRangeQuery("2026-09")).toBe("from=2026-09-01&to=2026-09-30");
    expect(monthRangeQuery("2026-02")).toBe("from=2026-02-01&to=2026-02-28");
  });

  it("handles a leap February", () => {
    expect(monthRangeQuery("2028-02")).toBe("from=2028-02-01&to=2028-02-29");
  });
});
