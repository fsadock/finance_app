import { describe, expect, it } from "vitest";
import { goalProgress } from "@/lib/domain/goals";

const today = new Date("2026-09-30T12:00:00");
const base = { targetAmount: 50000, currentAmount: 0, deadline: null };

describe("goalProgress", () => {
  /**
   * The real case: a goal linked only to the broker account showed R$ 45.453,91 while the owner had
   * R$ 47.035,06 invested — the crypto wallets are investment accounts of their own.
   */
  it("sums every account the goal follows", () => {
    const r = goalProgress({ ...base, accounts: [{ balance: 45453.91 }, { balance: 1099.88 }, { balance: 481.27 }] }, today);
    expect(r.saved).toBeCloseTo(47035.06, 2);
    expect(r.remaining).toBeCloseTo(2964.94, 2);
  });

  it("falls back to the typed amount when it follows nothing", () => {
    expect(goalProgress({ ...base, currentAmount: 1200, accounts: null }, today).saved).toBe(1200);
  });

  it("never reports negative savings", () => {
    expect(goalProgress({ ...base, accounts: [{ balance: -300 }] }, today).saved).toBe(0);
  });

  it("is complete once the accounts cover the target", () => {
    const r = goalProgress({ ...base, accounts: [{ balance: 50000 }] }, today);
    expect(r.pct).toBe(100);
    expect(r.remaining).toBe(0);
  });

  it("spreads what is left over the months to the deadline", () => {
    const r = goalProgress({ ...base, accounts: [{ balance: 44000 }], deadline: new Date("2026-12-31T12:00:00") }, today);
    expect(r.monthlyNeeded).toBeCloseTo(2000, 2);
  });
});
