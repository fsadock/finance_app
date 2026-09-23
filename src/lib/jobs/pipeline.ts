import { logger } from "@/lib/infra/logger";
import { errorMessage } from "@/lib/utils";
import { TRANSFER_DETECTION_DAYS_BACK } from "@/lib/domain/constants";
import { applyDeterministicRules } from "@/lib/jobs/deterministic";
import { removeDuplicateTransactions } from "@/lib/jobs/duplicates";
import { updateChargeDates } from "@/lib/jobs/charge-dates";
import { applyPassThroughs } from "@/lib/jobs/pass-through";
import { detectTransfers } from "@/lib/jobs/transfers";
import { categorizeAllPending } from "@/lib/jobs/categorize";
import { refreshRecurrings } from "@/lib/jobs/recurrings";
import { detectRecurrings } from "@/lib/ai/recurrings";
import { aiErrorMessage } from "@/lib/ai/client";

/**
 * @param fullHistory scan all history for transfer pairs — used on the first sync of a newly connected
 * bank, whose outflows can pair with older inflows (e.g. salary moved from that bank, already categorized).
 */
export async function runPostSyncJobs({ fullHistory = false } = {}) {
  const out = {
    duplicatesRemoved: 0,
    chargeDatesUpdated: 0,
    passThroughs: 0,
    deterministic: 0,
    transfersPaired: 0,
    categorized: 0,
    fromRules: 0,
    fromAI: 0,
    pendingReview: 0,
    recurringsLinked: 0,
    recurringsChanged: 0,
    recurringsDetected: 0,
    aiError: null as string | null,
  };
  logger.info("post-sync:start");

  try {
    out.duplicatesRemoved = (await removeDuplicateTransactions()).removed;
  } catch (e) {
    logger.error("post-sync:duplicates_failed", { error: errorMessage(e) });
  }

  try {
    out.chargeDatesUpdated = (await updateChargeDates()).updated;
  } catch (e) {
    logger.error("post-sync:charge_dates_failed", { error: errorMessage(e) });
  }

  try {
    const d = await applyDeterministicRules();
    out.deterministic = d.categorized;
  } catch (e) {
    logger.error("post-sync:deterministic_failed", { error: errorMessage(e) });
  }

  try {
    out.transfersPaired = (await detectTransfers(fullHistory ? 365 * 5 : TRANSFER_DETECTION_DAYS_BACK)).paired;
  } catch (e) {
    logger.error("post-sync:transfers_failed", { error: errorMessage(e) });
  }

  out.passThroughs = (await applyPassThroughs()).marked;

  const c = await categorizeAllPending();
  out.categorized = c.applied;
  out.fromRules = c.fromRules;
  out.fromAI = c.fromAI;
  out.pendingReview = c.remaining;
  out.aiError = c.error;

  try {
    const refreshed = await refreshRecurrings();
    out.recurringsLinked = refreshed.linked;
    out.recurringsChanged = refreshed.changed;
    if (!out.aiError && c.aiConfigured) out.recurringsDetected = (await detectRecurrings()).detected;
  } catch (e) {
    out.aiError ??= aiErrorMessage(e);
    logger.error("post-sync:recurrings_failed", { error: errorMessage(e) });
  }

  logger.info("post-sync:done", out);
  return out;
}
