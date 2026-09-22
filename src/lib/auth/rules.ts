/** Paths anyone may open: the sign-in page and the calls it makes. Everything else needs a session. */
export function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/api/auth/");
}

/**
 * The address the browser is on. Behind Tailscale Serve the server listens on another one, so this comes from
 * the headers; any address that isn't this machine is HTTPS (passkeys only work there).
 */
export function publicOrigin(headers: Headers) {
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${headers.get("x-forwarded-proto") ?? (local ? "http" : "https")}://${host}`;
}

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

/** A one-time code as people type it: case, spaces and dashes don't matter. */
export function normalizeCode(input: string) {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** `pick(n)` returns a random integer in [0, n). */
export function newCode(pick: (n: number) => number) {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[pick(CODE_ALPHABET.length)]).join("");
}

const DEVICES: [string, string][] = [
  ["iPhone", "iPhone"],
  ["iPad", "iPad"],
  ["Android", "Android"],
  ["Macintosh", "Mac"],
  ["Windows", "Windows"],
  ["CrOS", "Chromebook"],
  ["Linux", "Linux"],
];
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/Firefox\/|FxiOS/, "Firefox"],
  [/Chrome\/|CriOS/, "Chrome"],
  [/Safari\//, "Safari"],
];

/** A readable name for the device registering a passkey, from its user agent. */
export function deviceName(userAgent: string | null) {
  const ua = userAgent ?? "";
  const device = DEVICES.find(([key]) => ua.includes(key))?.[1] ?? "Dispositivo";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  return browser ? `${device} · ${browser}` : device;
}
