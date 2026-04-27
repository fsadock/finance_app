"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { normalizeMerchant } from "@/lib/ai/merchant";

export async function setTransactionCategory(txId: string, categoryId: string | null) {
  const tx = await prisma.transaction.findUnique({
    where: { id: txId },
    select: { id: true, description: true, merchantRaw: true },
  });
  if (!tx) throw new Error("Transação não encontrada");

  await prisma.transaction.update({
    where: { id: txId },
    data: {
      categoryId,
      status: categoryId ? "POSTED" : "REVIEW",
    },
  });

  // Save USER rule when assigning a category (overrides any AI rule)
  if (categoryId) {
    const pattern = normalizeMerchant(tx.merchantRaw ?? tx.description);
    if (pattern) {
      await prisma.merchantRule.upsert({
        where: { pattern },
        create: {
          pattern,
          categoryId,
          confidence: 1.0,
          source: "USER",
          hits: 1,
        },
        update: {
          categoryId,
          confidence: 1.0,
          source: "USER",
        },
      });
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/");
  revalidatePath("/categories");
  return { ok: true };
}
