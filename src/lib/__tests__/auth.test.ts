import { describe, expect, it, vi } from "vitest";
import { CODE_LENGTH, deviceName, formatCode, isPublicPath, newCode, normalizeCode, publicOrigin } from "@/lib/auth/rules";

describe("isPublicPath", () => {
  it("opens only the sign-in page and its API", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/login")).toBe(true);
    for (const p of ["/", "/transactions", "/login/x", "/api/pluggy/sync", "/api/transactions/export", "/settings"]) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});

describe("enrollment codes", () => {
  it("are typed back regardless of case, spaces and dashes", () => {
    const code = newCode((n) => n - 1);
    expect(code).toHaveLength(CODE_LENGTH);
    expect(normalizeCode(` ${formatCode(code).toLowerCase()} `)).toBe(code);
  });

  it("avoid characters that look alike", () => {
    expect(newCode(() => 0) + newCode((n) => n - 1)).not.toMatch(/[01ILO]/);
  });
});

describe("deviceName", () => {
  it("names the device and browser", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(deviceName("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0")).toBe("Linux · Firefox");
    expect(deviceName("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceName(null)).toBe("Dispositivo");
  });
});

describe("publicOrigin", () => {
  it("is the address the browser used, also behind Tailscale Serve", () => {
    expect(publicOrigin(new Headers({ host: "localhost:3100" }))).toBe("http://localhost:3100");
    expect(publicOrigin(new Headers({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
    expect(publicOrigin(new Headers({ host: "fedora.tailnet.ts.net" }))).toBe("https://fedora.tailnet.ts.net");
    expect(publicOrigin(new Headers({ host: "127.0.0.1:3000", "x-forwarded-host": "fedora.tailnet.ts.net", "x-forwarded-proto": "https" }))).toBe(
      "https://fedora.tailnet.ts.net"
    );
  });
});

describe("instance name", () => {
  it("turns a name into a key for the cookie and the passkey identity", async () => {
    vi.resetModules();
    vi.stubEnv("FINANCAS_INSTANCE", " Maria Júlia ");
    const { APP_NAME, INSTANCE_KEY } = await import("@/lib/infra/app");
    expect(APP_NAME).toBe("Finanças · Maria Júlia");
    expect(INSTANCE_KEY).toBe("maria_julia");
    vi.unstubAllEnvs();
    vi.resetModules();
    expect((await import("@/lib/infra/app")).APP_NAME).toBe("Finanças");
  });
});
