import { prisma } from "@/lib/infra/db";

/** Registered passkeys, newest first, marking the one this browser signed in with. */
export async function getDevices(currentPasskeyId: string | undefined) {
  const passkeys = await prisma.passkey.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });
  return passkeys.map((p) => ({ ...p, current: p.id === currentPasskeyId }));
}

export async function hasPasskeys() {
  return (await prisma.passkey.count()) > 0;
}
