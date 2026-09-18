import { prisma } from "@/lib/infra/db";
import { RECLASSIFY_CONFIRMATION } from "@/lib/domain/constants";
import { deleteConfig, getConfig, setConfig } from "@/lib/infra/config";
import { merchantPattern } from "@/lib/domain/merchant";
import { deterministicCategory } from "@/lib/domain/brazil";
import { applyDeterministicRules } from "@/lib/jobs/deterministic";
import { categorizeAllPending } from "@/lib/ai/categorize";
import { checkAiAvailable } from "@/lib/ai/client";


type Backup = {
  createdAt: string;
  rules: { pattern: string; categoryId: string; confidence: number; hits: number }[];
  transactions: { id: string; categoryId: string | null; status: "POSTED" | "PENDING" | "REVIEW"; excludeFromBudget: boolean }[];
};

/**
 * Decides what a reclassification would touch, without changing anything.
 * Resets only transactions whose merchant pattern matches an AI-source rule. Never: user rules,
 * built-in classifications (transfers, bill payments, investments, yield) or categories set on a
 * single transaction.
 */
export async function planReclassify() {
  const [aiRules, userRules, candidates] = await Promise.all([
    prisma.merchantRule.findMany({ where: { source: "AI" }, select: { pattern: true, categoryId: true, confidence: true, hits: true } }),
    prisma.merchantRule.count({ where: { source: "USER" } }),
    prisma.transaction.findMany({
      where: { status: "POSTED", transferPairId: null, categoryId: { not: null } },
      select: {
        id: true,
        description: true,
        merchantRaw: true,
        counterpartyName: true,
        counterpartyType: true,
        paymentMethod: true,
        amount: true,
        categoryId: true,
        status: true,
        excludeFromBudget: true,
        account: { select: { type: true } },
        category: { select: { name: true } },
      },
    }),
  ]);
  const userPatterns = new Set(
    (await prisma.merchantRule.findMany({ where: { source: "USER" }, select: { pattern: true } })).map((r) => r.pattern)
  );
  const aiPatterns = new Set(aiRules.map((r) => r.pattern));

  const toReset = candidates.filter((t) => {
    const pattern = merchantPattern(t);
    if (!pattern || !aiPatterns.has(pattern) || userPatterns.has(pattern)) return false;
    return deterministicCategory({ ...t, accountType: t.account.type }) === null;
  });

  const byCategory = new Map<string, number>();
  for (const t of toReset) byCategory.set(t.category?.name ?? "—", (byCategory.get(t.category?.name ?? "—") ?? 0) + 1);

  return {
    aiRules,
    toReset,
    summary: {
      aiRules: aiRules.length,
      transactionsToReset: toReset.length,
      byCategory: [...byCategory].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      protectedUserRules: userRules,
      protectedTransactions: candidates.length - toReset.length,
    },
  };
}

export type ReclassifyPreview = Awaited<ReturnType<typeof planReclassify>>["summary"] & { aiUnavailable: string | null };

export async function previewReclassify(): Promise<ReclassifyPreview> {
  const [plan, aiUnavailable] = await Promise.all([planReclassify(), checkAiAvailable()]);
  return { ...plan.summary, aiUnavailable };
}

/**
 * Runs the reclassification after saving a restore point. Requires the typed confirmation and a
 * working AI; otherwise nothing is changed.
 */
export async function runReclassify(confirmation: string) {
  if (confirmation.trim() !== RECLASSIFY_CONFIRMATION) {
    return { ok: false as const, error: `Confirmação inválida: digite ${RECLASSIFY_CONFIRMATION}.` };
  }
  const unavailable = await checkAiAvailable();
  if (unavailable) return { ok: false as const, error: `${unavailable} Nada foi alterado.` };

  const plan = await planReclassify();
  const backup: Backup = {
    createdAt: new Date().toISOString(),
    rules: plan.aiRules,
    transactions: plan.toReset.map((t) => ({ id: t.id, categoryId: t.categoryId, status: t.status, excludeFromBudget: t.excludeFromBudget })),
  };
  const value = JSON.stringify(backup);

  await prisma.$transaction([
    setConfig("reclassifyBackup", value),
    prisma.merchantRule.deleteMany({ where: { source: "AI" } }),
    prisma.transaction.updateMany({
      where: { id: { in: plan.toReset.map((t) => t.id) } },
      data: { status: "REVIEW", categoryId: null, excludeFromBudget: false },
    }),
  ]);

  await applyDeterministicRules();
  const result = await categorizeAllPending();
  return {
    ok: true as const,
    rulesDeleted: plan.aiRules.length,
    txReset: plan.toReset.length,
    recategorized: result.applied,
    remaining: result.remaining,
    error: result.error,
  };
}

export async function getReclassifyBackupInfo() {
  const saved = await getConfig("reclassifyBackup");
  if (!saved) return null;
  const backup = JSON.parse(saved) as Backup;
  return { createdAt: backup.createdAt, rules: backup.rules.length, transactions: backup.transactions.length };
}

/**
 * Restores the last reclassification's restore point: the deleted AI rules and each transaction's previous
 * category — except merchants you categorized yourself afterwards (a category picked in the UI always
 * creates one of your rules, and those win).
 */
export async function undoReclassify() {
  const saved = await getConfig("reclassifyBackup");
  if (!saved) return { ok: false as const, error: "Nenhuma reclassificação para desfazer." };
  const backup = JSON.parse(saved) as Backup;
  const createdAt = new Date(backup.createdAt);

  const [existingPatterns, userPatterns, current] = await Promise.all([
    // rules that survive the undo: everything except AI rules the reclassification itself created
    prisma.merchantRule
      .findMany({ where: { NOT: { source: "AI", createdAt: { gte: createdAt } } }, select: { pattern: true } })
      .then((r) => new Set(r.map((x) => x.pattern))),
    prisma.merchantRule.findMany({ where: { source: "USER" }, select: { pattern: true } }).then((r) => new Set(r.map((x) => x.pattern))),
    prisma.transaction.findMany({
      where: { id: { in: backup.transactions.map((t) => t.id) } },
      select: { id: true, description: true, merchantRaw: true, counterpartyName: true },
    }),
  ]);
  const byId = new Map(current.map((t) => [t.id, t]));

  // Rules the user created after the reclassification for the same merchants win over the restore.
  const rulesToRestore = backup.rules.filter((r) => !existingPatterns.has(r.pattern));
  const txToRestore = backup.transactions.filter((t) => {
    const tx = byId.get(t.id);
    return tx && !userPatterns.has(merchantPattern(tx));
  });

  // AI rules created by the reclassification itself are replaced by the restored ones.
  await prisma.$transaction([
    prisma.merchantRule.deleteMany({ where: { source: "AI", createdAt: { gte: createdAt } } }),
    prisma.merchantRule.createMany({ data: rulesToRestore.map((r) => ({ ...r, source: "AI" })) }),
    ...txToRestore.map((t) =>
      prisma.transaction.update({
        where: { id: t.id },
        data: { categoryId: t.categoryId, status: t.status, excludeFromBudget: t.excludeFromBudget },
      })
    ),
    deleteConfig("reclassifyBackup"),
  ]);
  return {
    ok: true as const,
    rulesRestored: rulesToRestore.length,
    transactionsRestored: txToRestore.length,
    skippedChangedByYou: backup.transactions.length - txToRestore.length,
  };
}
