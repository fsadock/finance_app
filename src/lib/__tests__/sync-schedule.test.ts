import { describe, expect, it } from "vitest";
import { isCollectionDue, isSyncDue } from "@/lib/domain/sync-schedule";

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

describe("isCollectionDue", () => {
  const now = new Date("2026-09-30T12:00:00Z");

  it("asks the bank when nothing was ever collected", () => {
    expect(isCollectionDue(null, now)).toBe(true);
  });

  it("does not ask again right after a collection", () => {
    expect(isCollectionDue(new Date("2026-09-30T11:00:00Z"), now)).toBe(false);
  });

  it("asks again once the data had time to go stale", () => {
    expect(isCollectionDue(new Date("2026-09-30T07:00:00Z"), now)).toBe(true);
  });
});
