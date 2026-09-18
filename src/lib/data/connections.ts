import { prisma } from "@/lib/infra/db";

export async function getLastSync() {
  const item = await prisma.pluggyItem.findFirst({
    where: { lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: "desc" },
    select: { lastSyncedAt: true },
  });
  return item?.lastSyncedAt ?? null;
}

/** Pluggy connections, oldest first. */
export function getConnections() {
  return prisma.pluggyItem.findMany({ orderBy: { createdAt: "asc" } });
}

