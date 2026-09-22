import { prisma } from "@/lib/infra/db";

/** Registered passkeys, newest first, marking the one this browser signed in with. */
export async function getDevices(currentPasskeyId: string | undefined) {
  const passkeys = await prisma.passkey.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, rpId: true, createdAt: true, lastUsedAt: true },
  });
  return passkeys.map((p) => ({ ...p, current: p.id === currentPasskeyId }));
}

/** Whether any passkey works at this address (passkeys belong to the hostname they were created on). */
export async function hasPasskeysFor(rpId: string) {
  return (await prisma.passkey.count({ where: { rpId } })) > 0;
}
