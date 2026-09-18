import { prisma } from "@/lib/infra/db";
import { logger } from "@/lib/infra/logger";
import { aiErrorMessage, getAnthropicOrNull } from "@/lib/ai/client";
import { suggestCategories, type CategorySuggestion as Suggestion } from "@/lib/ai/categorize";
import { matchRulesToTransactions, merchantPattern } from "@/lib/domain/merchant";
import {
  CATEGORIZE_BATCH_SIZE,
  CATEGORIZE_MIN_CONFIDENCE,
  CATEGORIZE_CACHE_RULE_MIN_CONFIDENCE,
} from "@/lib/domain/constants";
import { errorMessage } from "@/lib/utils";

/**
 * Categorizes one batch of REVIEW transactions (rules first, then AI).
 * Pass the ids returned in `attemptedIds` from previous passes as `skipIds` — otherwise transactions the
 * AI can't classify confidently are re-fetched on every pass and block everything behind them.
 */
async function categorizeReviewTransactions(skipIds: string[] = [], { useAI = true } = {}) {
  const [txs, categories, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "REVIEW", ...(skipIds.length > 0 ? { id: { notIn: skipIds } } : {}) },
      orderBy: { date: "desc" },
      select: {
        id: true,
        description: true,
        merchantRaw: true,
        amount: true,
        date: true,
        paymentMethod: true,
        counterpartyName: true,
        counterpartyType: true,
        merchantName: true,
        merchantCnae: true,
        mcc: true,
        installmentNumber: true,
        totalInstallments: true,
        pluggyCategory: true,
        account: { select: { type: true } },
      },
      take: CATEGORIZE_BATCH_SIZE,
    }),
    prisma.category.findMany({ where: { excludeFromBudget: false } }),
    prisma.merchantRule.findMany(),
  ]);

  const attemptedIds = txs.map((t) => t.id);
  if (txs.length === 0) {
    return { applied: 0, fromRules: 0, fromAI: 0, attemptedIds, suggestions: [] as Suggestion[] };
  }

  const catByName = new Map(categories.map((c) => [c.name, c]));

  // Pass 1: apply existing rules
  const { matched, remaining } = matchRulesToTransactions(txs, rules);
  let fromRules = 0;
  for (const { tx: t, rule } of matched) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: t.id },
        data: { categoryId: rule.categoryId, status: "POSTED" },
      }),
      prisma.merchantRule.update({
        where: { id: rule.id },
        data: { hits: { increment: 1 } },
      }),
    ]);
    fromRules++;
  }

  if (remaining.length === 0 || !useAI) {
    return { applied: fromRules, fromRules, fromAI: 0, attemptedIds, suggestions: [] as Suggestion[] };
  }

  // Pass 2: AI classifies the rest
  const { suggestions, usage } = await suggestCategories(remaining, categories);

  let fromAI = 0;
  // Build txId -> tx map for merchant lookup
  const txById = new Map(remaining.map((t) => [t.id, t]));
  for (const s of suggestions) {
    const cat = catByName.get(s.categoryName);
    if (!cat) continue;
    if (s.confidence < CATEGORIZE_MIN_CONFIDENCE) continue;
    const tx = txById.get(s.txId);
    if (!tx) continue;

    await prisma.transaction.update({
      where: { id: s.txId },
      data: { categoryId: cat.id, status: "POSTED" },
    });
    fromAI++;

    // Cache rule for future tx
    const pattern = merchantPattern(tx);
    if (pattern && s.confidence >= CATEGORIZE_CACHE_RULE_MIN_CONFIDENCE) {
      const existing = await prisma.merchantRule.findUnique({ where: { pattern }, select: { source: true } });
      if (!existing) {
        await prisma.merchantRule.create({
          data: { pattern, categoryId: cat.id, confidence: s.confidence, source: "AI", hits: 1 },
        });
      } else if (existing.source === "AI") {
        // never overwrite USER rules
        await prisma.merchantRule.update({
          where: { pattern },
          data: { categoryId: cat.id, confidence: s.confidence },
        });
      }
    }
  }

  logger.info("ai:categorize", { fromRules, fromAI, ...usage });

  return { applied: fromRules + fromAI, fromRules, fromAI, attemptedIds, suggestions, usage };
}

/**
 * Categorizes every REVIEW transaction: passes continue until each has been tried once.
 * Returns the AI error (if any) instead of throwing, so callers can show it.
 */
export async function categorizeAllPending(maxPasses = 150) {
  // Without a key the AI is simply skipped: merchant rules still apply, the rest waits in REVIEW.
  const useAI = Boolean(await getAnthropicOrNull());
  const out = { applied: 0, fromRules: 0, fromAI: 0, remaining: 0, error: null as string | null, aiConfigured: useAI };
  const attempted: string[] = [];
  for (let i = 0; i < maxPasses; i++) {
    try {
      const r = await categorizeReviewTransactions(attempted, { useAI });
      if (r.attemptedIds.length === 0) break;
      attempted.push(...r.attemptedIds);
      out.applied += r.applied;
      out.fromRules += r.fromRules;
      out.fromAI += r.fromAI;
    } catch (e) {
      out.error = aiErrorMessage(e);
      logger.error("ai:categorize_failed", { pass: i + 1, error: errorMessage(e) });
      break;
    }
  }
  out.remaining = await prisma.transaction.count({ where: { status: "REVIEW" } });
  return out;
}
