import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/infra/db";
import { DAY_MS } from "@/lib/domain/format";

export const SESSION_COOKIE = "financas_session";
const SESSION_DAYS = 365;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(passkeyId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS);
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    prisma.session.create({ data: { id: hash(token), passkeyId, expiresAt } }),
  ]);
  return { token, expiresAt };
}

export async function findSession(token: string | undefined) {
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { id: hash(token) }, select: { passkeyId: true, expiresAt: true } });
  return session && session.expiresAt > new Date() ? session : null;
}

/** The session of the request being handled (server components and server actions). */
export async function currentSession() {
  return findSession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function endCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hash(token) } });
  jar.delete(SESSION_COOKIE);
}
