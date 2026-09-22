import { prisma } from "@/lib/infra/db";
import { logger } from "@/lib/infra/logger";
import { getLastSync } from "@/lib/data/connections";
import { isSyncDue } from "@/lib/domain/sync-schedule";
import { syncAllItems } from "@/lib/pluggy/sync";
import { runPostSyncJobs } from "./pipeline";

const CHECK_EVERY_MS = 30 * 60_000;

/** Pulls every bank connection from Pluggy, then processes what arrived. */
export async function syncEverything() {
  const items = await syncAllItems();
  const post = await runPostSyncJobs();
  return { items, post };
}

/** Keeps bank data fresh on its own: checks every 30 minutes and syncs when the last sync is too old. */
export function startAutoSync() {
  let lastAttempt: Date | null = null;
  const tick = async () => {
    const now = new Date();
    if (!isSyncDue(await getLastSync(), lastAttempt, now) || (await prisma.pluggyItem.count()) === 0) return;
    lastAttempt = now;
    try {
      const { items, post } = await syncEverything();
      logger.info("auto-sync", { connections: items.length, failed: items.filter((i) => !i.ok).length, pendingReview: post.pendingReview });
    } catch (e) {
      logger.error("auto-sync failed", { error: e instanceof Error ? e.message : String(e) });
    }
  };
  setInterval(() => void tick(), CHECK_EVERY_MS).unref();
  setTimeout(() => void tick(), 60_000).unref();
}
