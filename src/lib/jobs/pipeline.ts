import { logger } from "@/lib/infra/logger";
import { errorMessage } from "@/lib/utils";
import { TRANSFER_DETECTION_DAYS_BACK } from "@/lib/domain/constants";
import { applyDeterministicRules } from "@/lib/jobs/deterministic";
import { removeDuplicateTransactions } from "@/lib/jobs/duplicates";
import { updateChargeDates } from "@/lib/jobs/charge-dates";
import { applyPassThroughs } from "@/lib/jobs/pass-through";
import { syncCryptoWallets } from "@/lib/jobs/crypto";
import { detectTransfers } from "@/lib/jobs/transfers";
import { categorizeAllPending } from "@/lib/jobs/categorize";
import { detectRecurrings, refreshRecurrings } from "@/lib/jobs/recurrings";

/** A failed step is logged and skipped, so the steps after it still run. */
async function step<T>(name: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (e) {
    logger.error(`post-sync:${name}_failed`, { error: errorMessage(e) });
    return null;
  }
}

/**
 * @param fullHistory scan all history for transfer pairs — used on the first sync of a newly connected
 * bank, whose outflows can pair with older inflows (e.g. salary moved from that bank, already categorized).
 */
export async function runPostSyncJobs({ fullHistory = false } = {}) {
  const out = {
    duplicatesRemoved: 0,
    chargeDatesUpdated: 0,
    passThroughs: 0,
    cryptoWallets: 0,
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

  out.duplicatesRemoved = (await step("duplicates", removeDuplicateTransactions))?.removed ?? 0;
  out.chargeDatesUpdated = (await step("charge_dates", updateChargeDates))?.updated ?? 0;
  out.deterministic = (await step("deterministic", applyDeterministicRules))?.categorized ?? 0;
  out.transfersPaired =
    (await step("transfers", () => detectTransfers(fullHistory ? 365 * 5 : TRANSFER_DETECTION_DAYS_BACK)))?.paired ?? 0;
  out.passThroughs = (await step("pass_through", applyPassThroughs))?.marked ?? 0;
  // watch-only wallets: read straight from the blockchains, so they refresh with everything else
  out.cryptoWallets = (await step("crypto", syncCryptoWallets))?.wallets ?? 0;

  const c = await step("categorize", () => categorizeAllPending());
  if (c) {
    out.categorized = c.applied;
    out.fromRules = c.fromRules;
    out.fromAI = c.fromAI;
    out.pendingReview = c.remaining;
    out.aiError = c.error;
  }

  const refreshed = await step("recurrings", () => refreshRecurrings());
  out.recurringsLinked = refreshed?.linked ?? 0;
  out.recurringsChanged = refreshed?.changed ?? 0;

  if (refreshed && c && !out.aiError) {
    const detected = await step("detect_recurrings", () => detectRecurrings({ useAI: c.aiConfigured }));
    out.recurringsDetected = detected?.detected ?? 0;
    out.aiError = detected?.aiError ?? null;
  }

  logger.info("post-sync:done", out);
  return out;
}
