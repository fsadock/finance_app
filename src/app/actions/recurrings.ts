"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";

const idSchema = z.string().min(1);

export async function setRecurringActive(id: string, active: boolean) {
  await prisma.recurring.update({ where: { id: idSchema.parse(id) }, data: { active: z.boolean().parse(active) } });
  revalidatePath("/recurrings");
  revalidatePath("/");
  return { ok: true };
}

/** Deletes a recurring and unlinks its transactions (they may be re-detected on the next sync). */
export async function deleteRecurring(id: string) {
  const rid = idSchema.parse(id);
  await prisma.$transaction([
    prisma.transaction.updateMany({ where: { recurringId: rid }, data: { recurringId: null, isRecurring: false } }),
    prisma.recurring.delete({ where: { id: rid } }),
  ]);
  revalidatePath("/recurrings");
  revalidatePath("/");
  return { ok: true };
}
