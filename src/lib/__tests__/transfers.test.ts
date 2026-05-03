import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { amountTolerance, findTransferPairs } from "../transfers";

const d = (offset: number) => {
  const date = new Date("2024-06-15T12:00:00Z");
  date.setDate(date.getDate() + offset);
  return date;
};

const tx = (id: string, accountId: string, amount: number, dayOffset = 0) => ({
  id,
  accountId,
  amount,
  date: d(dayOffset),
});

describe("amountTolerance", () => {
  it("returns floor for tiny amounts", () => {
    expect(amountTolerance(1)).toBe(0.02); // 0.5% of 1 = 0.005, floor wins
  });

  it("returns percentage for large amounts", () => {
    expect(amountTolerance(1000)).toBeCloseTo(5); // 0.5% of 1000
  });

  it("works with negative amounts (uses absolute value)", () => {
    expect(amountTolerance(-1000)).toBeCloseTo(5);
    expect(amountTolerance(-1000)).toBe(amountTolerance(1000));
  });

  it("floor is R$0.02", () => {
    expect(amountTolerance(0)).toBe(0.02);
  });
});

describe("findTransferPairs", () => {
  it("pairs a matching debit/credit between different accounts", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("in1", "acc-b", 500, 0),
    ];
    const pairs = findTransferPairs(txs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]![0].id).toBe("out1");
    expect(pairs[0]![1].id).toBe("in1");
  });

  it("does not pair transactions on the same account", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("in1", "acc-a", 500, 0), // same account
    ];
    expect(findTransferPairs(txs)).toHaveLength(0);
  });

  it("does not pair when amount delta exceeds tolerance", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("in1", "acc-b", 510, 0), // 10 > 2.5 tolerance (0.5% of 500)
    ];
    expect(findTransferPairs(txs)).toHaveLength(0);
  });

  it("pairs when amount delta is within tolerance (IOF scenario)", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("in1", "acc-b", 498, 0), // 2 < 2.5 tolerance
    ];
    const pairs = findTransferPairs(txs);
    expect(pairs).toHaveLength(1);
  });

  it("does not pair when date gap exceeds 5-day window", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("in1", "acc-b", 500, 6), // 6 days later
    ];
    expect(findTransferPairs(txs)).toHaveLength(0);
  });

  it("pairs when date gap is exactly at the window boundary (5 days)", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("in1", "acc-b", 500, 5),
    ];
    const pairs = findTransferPairs(txs);
    expect(pairs).toHaveLength(1);
  });

  it("picks the closest temporal match when multiple candidates exist", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("in-far", "acc-b", 500, 4),
      tx("in-near", "acc-b", 500, 1), // closer in time
    ];
    const pairs = findTransferPairs(txs);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]![1].id).toBe("in-near");
  });

  it("does not reuse the same incoming transaction for two outgoing", () => {
    const txs = [
      tx("out1", "acc-a", -500, 0),
      tx("out2", "acc-a", -500, 1),
      tx("in1", "acc-b", 500, 0), // only one match available
    ];
    const pairs = findTransferPairs(txs);
    expect(pairs).toHaveLength(1);
  });

  it("handles multiple independent pairs", () => {
    const txs = [
      tx("out1", "acc-a", -100, 0),
      tx("out2", "acc-a", -200, 0),
      tx("in1", "acc-b", 100, 0),
      tx("in2", "acc-b", 200, 0),
    ];
    const pairs = findTransferPairs(txs);
    expect(pairs).toHaveLength(2);
  });

  it("returns empty for an empty transaction list", () => {
    expect(findTransferPairs([])).toHaveLength(0);
  });

  it("returns empty when no positive transactions exist", () => {
    const txs = [tx("out1", "acc-a", -500, 0)];
    expect(findTransferPairs(txs)).toHaveLength(0);
  });
});
