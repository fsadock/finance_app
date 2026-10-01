import { describe, expect, it } from "vitest";
import { DEFAULT_LOCK_MINUTES, isLocked, lockLabel } from "@/lib/domain/auth-lock";

const now = new Date("2026-10-01T12:00:00");
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

describe("isLocked", () => {
  it("stays open while the app is being used", () => {
    expect(isLocked(minutesAgo(1), DEFAULT_LOCK_MINUTES, now)).toBe(false);
  });

  it("locks once the idle window has passed", () => {
    expect(isLocked(minutesAgo(3), DEFAULT_LOCK_MINUTES, now)).toBe(true);
  });

  it("locks exactly at the boundary, not a minute later", () => {
    expect(isLocked(minutesAgo(2), 2, now)).toBe(true);
  });

  it("never locks when turned off — the way back in if a device cannot show the prompt", () => {
    expect(isLocked(minutesAgo(60 * 24), 0, now)).toBe(false);
  });
});

describe("lockLabel", () => {
  it("names each choice the way a person would say it", () => {
    expect([0, 1, 2, 60].map(lockLabel)).toEqual([
      "Nunca",
      "Depois de 1 minuto",
      "Depois de 2 minutos",
      "Depois de 1 hora",
    ]);
  });
});
