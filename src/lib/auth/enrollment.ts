import { randomInt } from "node:crypto";
import { logger } from "@/lib/infra/logger";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { formatCode, newCode, normalizeCode } from "./rules";

const CODE_TTL_MS = 15 * 60_000;

// Held on globalThis: route handlers and pages can load separate copies of this module.
const state = ((globalThis as { financasEnrollment?: { codes: Map<string, number>; setup: string | null } }).financasEnrollment ??=
  { codes: new Map(), setup: null });

function isActive(code: string) {
  const expiresAt = state.codes.get(code);
  if (expiresAt !== undefined && expiresAt < Date.now()) state.codes.delete(code);
  return state.codes.has(code);
}

/** A one-time code that lets a new device register a passkey. */
export function issueCode() {
  const code = newCode(randomInt);
  state.codes.set(code, Date.now() + CODE_TTL_MS);
  return { code: formatCode(code), expiresAt: new Date(state.codes.get(code)!) };
}

/** Before the first passkey exists, the only way in is a code printed in the server log. */
export function logSetupCode() {
  if (state.setup && isActive(state.setup)) return;
  const { code } = issueCode();
  state.setup = normalizeCode(code);
  logger.warn(`Código para criar a primeira passkey: ${code} (vale 15 minutos)`);
}

/** Checks a typed code; `consume` spends it. Wrong guesses are rate-limited. */
export function checkCode(input: unknown, { consume = false } = {}) {
  if (typeof input !== "string" || !checkRateLimit("auth-code", 10, CODE_TTL_MS)) return false;
  const code = normalizeCode(input);
  if (!isActive(code)) return false;
  if (consume) state.codes.delete(code);
  return true;
}
