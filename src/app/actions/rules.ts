"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/infra/db";
import { z } from "zod";

const idSchema = z.string().min(1);

export async function deleteMerchantRule(id: string) {
  await prisma.merchantRule.delete({ where: { id: idSchema.parse(id) } });
  revalidatePath("/rules");
  return { ok: true };
}

/** Changing a rule's category promotes it to a USER rule (AI never overwrites those). */
export async function setMerchantRuleCategory(id: string, categoryId: string) {
  await prisma.merchantRule.update({
    where: { id: idSchema.parse(id) },
    data: { categoryId: idSchema.parse(categoryId), source: "USER", confidence: 1 },
  });
  revalidatePath("/rules");
  return { ok: true };
}
