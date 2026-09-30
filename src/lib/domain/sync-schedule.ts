/** Bank data is pulled from Pluggy at least this often, whether or not anyone opens the app. */
const AUTO_SYNC_EVERY_MS = 12 * 60 * 60_000;
/** After an attempt (failed or not), wait this long before the next one. */
const RETRY_AFTER_MS = 60 * 60_000;

export function isSyncDue(lastSync: Date | null, lastAttempt: Date | null, now: Date) {
  if (lastAttempt && now.getTime() - lastAttempt.getTime() < RETRY_AFTER_MS) return false;
  return !lastSync || now.getTime() - lastSync.getTime() >= AUTO_SYNC_EVERY_MS;
}
