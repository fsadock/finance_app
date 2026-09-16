import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { isPlaceholder, isValidPluggyClientId, maskSecret, resolveSetting } from "../settings";

describe("settings", () => {
  it("prefers the value saved in the app over .env", () => {
    expect(resolveSetting("app-secret-123", "env-secret-456")).toEqual({ value: "app-secret-123", source: "app" });
    expect(resolveSetting(null, "env-secret-456")).toEqual({ value: "env-secret-456", source: "env" });
  });

  it("ignores placeholders copied from .env.example", () => {
    expect(resolveSetting(null, "sk-ant-...")).toEqual({ value: null, source: null });
    expect(resolveSetting(null, "your-pluggy-client-secret")).toEqual({ value: null, source: null });
    expect(resolveSetting("  ", "00000000-0000-0000-0000-000000000000")).toEqual({ value: null, source: null });
    expect(isPlaceholder("real-value")).toBe(false);
  });

  it("validates the Pluggy client id format", () => {
    expect(isValidPluggyClientId("3f8e2a1c-1234-4abc-9def-0123456789ab")).toBe(true);
    expect(isValidPluggyClientId("your-pluggy-client-id")).toBe(false);
  });

  it("never exposes more than the last 4 characters", () => {
    expect(maskSecret("fake-test-key-1234")).toBe("••••••1234");
    expect(maskSecret(null)).toBeNull();
  });
});
