"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { normalizeMerchant } from "@/lib/ai/merchant";
import { CATEGORIZE_MAX_RETRY_PASSES } from "@/lib/constants";
import { z } from "zod";

const txIdSchema = z.string().min(1);
const categoryIdSchema = z.string().min(1).nullable();
const tagNameSchema = z.string().min(1).max(50).trim();

const createCategorySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  group: z.string().min(1).max(100).trim().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/**
 * Set the category for a single transaction. Always propagates the assignment
 * to every other transaction sharing the same normalized merchant pattern,
 * and saves a USER MerchantRule (highest priority) so future imports auto-apply
 * the same category.
 *
 * Pass categoryId=null to clear (sends tx back to REVIEW).
 */
export async function setTransactionCategory(txId: string, categoryId: string | null) {
  const id = txIdSchema.parse(txId);
  const catId = categoryIdSchema.parse(categoryId);

  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { id: true, description: true, merchantRaw: true },
  });
  if (!tx) throw new Error("Transação não encontrada");

  const pattern = normalizeMerchant(tx.merchantRaw ?? tx.description);

  if (catId) {
    // 1. USER rule (overrides AI rules forever)
    if (pattern) {
      await prisma.merchantRule.upsert({
        where: { pattern },
        create: { pattern, categoryId: catId, confidence: 1.0, source: "USER", hits: 1 },
        update: { categoryId: catId, confidence: 1.0, source: "USER" },
      });
    }
    // 2. Update target tx + propagate to all matching tx (same pattern)
    if (pattern) {
      const allTx = await prisma.transaction.findMany({
        select: { id: true, description: true, merchantRaw: true },
      });
      const matchingIds = allTx
        .filter((t) => normalizeMerchant(t.merchantRaw ?? t.description) === pattern)
        .map((t) => t.id);
      if (matchingIds.length > 0) {
        await prisma.transaction.updateMany({
          where: { id: { in: matchingIds } },
          data: { categoryId: catId, status: "POSTED" },
        });
      }
    } else {
      // No usable pattern — just update this single tx
      await prisma.transaction.update({
        where: { id },
        data: { categoryId: catId, status: "POSTED" },
      });
    }
  } else {
    // Clear category on the single tx only (don't mass-uncategorize others)
    await prisma.transaction.update({
      where: { id },
      data: { categoryId: null, status: "REVIEW" },
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/categories");
  return { ok: true };
}

/**
 * Wipe all AI-source rules and reset AI-classified transactions back to REVIEW.
 * Keeps USER rules and user-classified tx untouched. Runs the categorize loop
 * so the new prompt + category taxonomy can re-examine everything.
 *
 * Safe to run multiple times.
 */
export async function resetAiClassifications() {
  const { categorizeReviewTransactions } = await import("@/lib/ai/categorize");

  // Drop AI rules
  const ruleResult = await prisma.merchantRule.deleteMany({ where: { source: "AI" } });

  // Reset tx that were classified by AI (not by user, not transfer-paired)
  const userRules = await prisma.merchantRule.findMany({
    where: { source: "USER" },
    select: { categoryId: true },
  });
  const userCategoryIds = new Set(userRules.map((r) => r.categoryId));

  const candidates = await prisma.transaction.findMany({
    where: {
      status: "POSTED",
      transferPairId: null,
      excludeFromBudget: false,
      categoryId: { not: null },
    },
    select: { id: true, categoryId: true, description: true, merchantRaw: true },
  });

  const { normalizeMerchant: normalize } = await import("@/lib/ai/merchant");

  // Build set of patterns covered by USER rules (so we don't reset those tx)
  const userRulesByPattern = await prisma.merchantRule.findMany({
    where: { source: "USER" },
    select: { pattern: true },
  });
  const userPatterns = new Set(userRulesByPattern.map((r) => r.pattern));

  const toReset = candidates.filter((t) => {
    const pattern = normalize(t.merchantRaw ?? t.description);
    return !userPatterns.has(pattern) && !userCategoryIds.has(t.categoryId!);
  });

  if (toReset.length > 0) {
    await prisma.transaction.updateMany({
      where: { id: { in: toReset.map((t) => t.id) } },
      data: { status: "REVIEW", categoryId: null },
    });
  }

  // Re-categorize with new prompt + taxonomy
  let totalApplied = 0;
  for (let i = 0; i < CATEGORIZE_MAX_RETRY_PASSES; i++) {
    const r = await categorizeReviewTransactions();
    if (!r.applied) break;
    totalApplied += r.applied;
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/categories");
  return { rulesDeleted: ruleResult.count, txReset: toReset.length, recategorized: totalApplied };
}

export async function createCategory(input: {
  name: string;
  group?: string;
  color?: string;
}) {
  const { name, group, color } = createCategorySchema.parse(input);
  const existing = await prisma.category.findUnique({ where: { name } });
  if (existing) throw new Error("Categoria já existe");
  const c = await prisma.category.create({
    data: {
      name,
      group: group ?? "Personalizadas",
      color: color ?? "#6b7280",
    },
  });
  revalidatePath("/categories");
  revalidatePath("/transactions");
  return c;
}

export async function addTransactionTag(txId: string, tagName: string) {
  const id = txIdSchema.parse(txId);
  const name = tagNameSchema.parse(tagName).toLowerCase();

  await prisma.transaction.update({
    where: { id },
    data: {
      tags: {
        connectOrCreate: {
          where: { name },
          create: { name, color: "#6b7280" },
        },
      },
    },
  });

  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
}

export async function removeTransactionTag(txId: string, tagId: string) {
  const id = txIdSchema.parse(txId);
  const tid = z.string().min(1).parse(tagId);

  await prisma.transaction.update({
    where: { id },
    data: { tags: { disconnect: { id: tid } } },
  });

  revalidatePath("/transactions");
  revalidatePath("/");
  return { ok: true };
}
