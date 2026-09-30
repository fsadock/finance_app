/** Bank data is pulled from Pluggy at least this often, whether or not anyone opens the app. */
const AUTO_SYNC_EVERY_MS = 12 * 60 * 60_000;
/** After an attempt (failed or not), wait this long before the next one. */
const RETRY_AFTER_MS = 60 * 60_000;

export function isSyncDue(lastSync: Date | null, lastAttempt: Date | null, now: Date) {
  if (lastAttempt && now.getTime() - lastAttempt.getTime() < RETRY_AFTER_MS) return false;
  return !lastSync || now.getTime() - lastSync.getTime() >= AUTO_SYNC_EVERY_MS;
}

/**
 * Pluggy re-queries the bank on its own about once a day. Asking again minutes later spends a collection
 * the bank counts against us and returns the same numbers, so a manual refresh is only worth it once the
 * last one has had time to go stale.
 */
const COLLECT_EVERY_MS = 4 * 60 * 60_000;

export function isCollectionDue(lastCollected: Date | null, now: Date) {
  return !lastCollected || now.getTime() - lastCollected.getTime() >= COLLECT_EVERY_MS;
}
