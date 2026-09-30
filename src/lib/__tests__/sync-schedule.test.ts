import { describe, expect, it } from "vitest";
import { isSyncDue } from "@/lib/domain/sync-schedule";

describe("isSyncDue", () => {
  const now = new Date(2026, 8, 22, 12);
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it("syncs when the last sync is 12 hours old or there was none", () => {
    expect(isSyncDue(hoursAgo(11), null, now)).toBe(false);
    expect(isSyncDue(hoursAgo(12), null, now)).toBe(true);
    expect(isSyncDue(null, null, now)).toBe(true);
  });
  it("waits an hour after an attempt, so a failing bank isn't retried every check", () => {
    expect(isSyncDue(hoursAgo(20), hoursAgo(0.5), now)).toBe(false);
    expect(isSyncDue(hoursAgo(20), hoursAgo(1), now)).toBe(true);
  });
});
