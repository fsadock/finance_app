import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/infra/db";
import { checkCode } from "./enrollment";
import { APP_NAME, INSTANCE_KEY } from "@/lib/infra/app";
import { publicOrigin } from "./rules";

export class AuthError extends Error {}

type RelyingParty = { origin: string; rpID: string };
type Ceremony = "login" | "register";

// The account a passkey belongs to, as the password manager sees it: one per instance, so two people on the
// same address don't overwrite each other's passkey.
const USER_ID = new TextEncoder().encode(INSTANCE_KEY ? `financas-owner-${INSTANCE_KEY}` : "financas-owner");
const CHALLENGE_TTL_MS = 5 * 60_000;

// Held on globalThis for the same reason as the enrollment codes.
const challenges = ((globalThis as { financasChallenges?: Map<string, { ceremony: Ceremony; expiresAt: number }> }).financasChallenges ??=
  new Map());

function rememberChallenge(challenge: string, ceremony: Ceremony) {
  challenges.set(challenge, { ceremony, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

/** Each challenge answers one ceremony, once. */
function takeChallenge(ceremony: Ceremony) {
  return (challenge: string) => {
    const entry = challenges.get(challenge);
    challenges.delete(challenge);
    return entry?.ceremony === ceremony && entry.expiresAt > Date.now();
  };
}

/** Passkeys belong to the hostname the browser is on (e.g. the tailnet name, or localhost). */
export function relyingParty(headers: Headers): RelyingParty {
  const origin = publicOrigin(headers);
  if (headers.get("origin") !== origin) throw new AuthError("Endereço não reconhecido. Recarregue a página.");
  return { origin, rpID: new URL(origin).hostname };
}

export async function registrationOptions(rp: RelyingParty, code: unknown) {
  if (!checkCode(code)) throw new AuthError("Código inválido ou expirado.");
  const existing = await prisma.passkey.findMany({ select: { id: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: APP_NAME,
    rpID: rp.rpID,
    userName: APP_NAME,
    userID: USER_ID,
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: transportsOf(p.transports) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  rememberChallenge(options.challenge, "register");
  return options;
}

/** Stores the new device's passkey and returns its id. */
export async function register(rp: RelyingParty, code: unknown, response: RegistrationResponseJSON, name: string) {
  if (!checkCode(code, { consume: true })) throw new AuthError("Código inválido ou expirado.");
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge: takeChallenge("register"),
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
  }).catch(rejected);
  if (!verified) throw new AuthError("A passkey não pôde ser verificada.");
  const { credential } = registrationInfo;
  await prisma.passkey.create({
    data: {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports?.join(",") || null,
      rpId: rp.rpID,
      name,
    },
  });
  return credential.id;
}

export async function authenticationOptions(rp: RelyingParty) {
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "required" });
  rememberChallenge(options.challenge, "login");
  return options;
}

/** Checks a sign-in and returns the passkey's id. */
export async function authenticate(rp: RelyingParty, response: AuthenticationResponseJSON) {
  const passkey = await prisma.passkey.findUnique({ where: { id: response.id } });
  if (!passkey) throw new AuthError("Esta passkey não está cadastrada (pode ter sido removida).");
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge: takeChallenge("login"),
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: { id: passkey.id, publicKey: passkey.publicKey, counter: passkey.counter, transports: transportsOf(passkey.transports) },
    requireUserVerification: true,
  }).catch(rejected);
  if (!verified) throw new AuthError("A passkey não pôde ser verificada.");
  await prisma.passkey.update({ where: { id: passkey.id }, data: { counter: authenticationInfo.newCounter, lastUsedAt: new Date() } });
  return passkey.id;
}

function transportsOf(value: string | null) {
  return value ? (value.split(",") as AuthenticatorTransport[]) : undefined;
}

function rejected(e: unknown): never {
  throw new AuthError(e instanceof Error ? e.message : "A passkey não pôde ser verificada.");
}
