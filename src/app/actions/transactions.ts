"use server";

import { revalidatePath } from "next/cache";
import { findCounterpart } from "@/lib/domain/pass-through";
import { DAY_MS } from "@/lib/domain/format";
import { prisma } from "@/lib/infra/db";
import { merchantPattern } from "@/lib/domain/merchant";
import { unpairTransfer } from "@/lib/jobs/transfers";
import { z } from "zod";

const txIdSchema = z.string().min(1);
const categoryIdSchema = z.string().min(1).nullable();
const tagNameSchema = z.string().min(1).max(50).trim();

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(100),
  group: z.string().trim().max(100).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isIncome: z.boolean().optional(),
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
    select: { id: true, description: true, merchantRaw: true, counterpartyName: true },
  });
  if (!tx) throw new Error("Transação não encontrada");

  const pattern = merchantPattern(tx);

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
        select: { id: true, description: true, merchantRaw: true, counterpartyName: true },
      });
      const matchingIds = allTx
        .filter((t) => merchantPattern(t) === pattern)
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

export async function setTransactionNotes(txId: string, notes: string) {
  const id = txIdSchema.parse(txId);
  const value = z.string().max(500).parse(notes).trim();
  await prisma.transaction.update({ where: { id }, data: { notes: value || null } });
  revalidatePath("/transactions");
  return { ok: true };
}

/** Undo an automatic transfer pairing: both sides go back to REVIEW and count in budgets again. */
export async function unpairTransferAction(txId: string) {
  const result = await unpairTransfer(txIdSchema.parse(txId));
  revalidatePath("/", "layout");
  return result;
}

export async function createCategory(input: z.input<typeof createCategorySchema>) {
  const { name, group, color, isIncome } = createCategorySchema.parse(input);
  const existing = await prisma.category.findUnique({ where: { name } });
  if (existing) throw new Error("Categoria já existe");
  const c = await prisma.category.create({
    data: {
      name,
      group: group || (isIncome ? "Income" : "Personalizadas"),
      color: color ?? "#6b7280",
      isIncome: isIncome ?? false,
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

const PASS_THROUGH_SELECT = {
  id: true,
  accountId: true,
  description: true,
  merchantRaw: true,
  counterpartyName: true,
  amount: true,
  chargeDate: true,
  excludeOverride: true,
  category: { select: { excludeFromBudget: true } },
} as const;

/**
 * Marks (or unmarks) money that only passes through the account — a bill someone else sends you the money for.
 * It stays in the list and in the balance, and stops counting in spending and budgets. The other side of the
 * pair moves with it, and the mark survives recategorization; `jobs/pass-through.ts` applies it to the next ones.
 */
export async function setPassThrough(txId: string, isPassThrough: boolean) {
  const id = txIdSchema.parse(txId);
  const tx = await prisma.transaction.findUnique({ where: { id }, select: PASS_THROUGH_SELECT });
  if (!tx) throw new Error("Transação não encontrada");

  const window = await prisma.transaction.findMany({
    where: {
      accountId: tx.accountId,
      chargeDate: { gte: new Date(tx.chargeDate.getTime() - 5 * DAY_MS), lte: new Date(tx.chargeDate.getTime() + 5 * DAY_MS) },
    },
    select: PASS_THROUGH_SELECT,
  });
  const counterpart = findCounterpart(tx, window);

  await prisma.$transaction(
    [tx, ...(counterpart ? [counterpart] : [])].map((t) =>
      prisma.transaction.update({
        where: { id: t.id },
        data: isPassThrough
          ? { excludeOverride: true, excludeFromBudget: true }
          : { excludeOverride: null, excludeFromBudget: t.category?.excludeFromBudget ?? false },
      })
    )
  );

  revalidatePath("/", "layout");
  return { changed: counterpart ? 2 : 1 };
}
