"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/infra/db";
import { z } from "zod";

const setGoalSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(100).trim(),
  targetAmount: z.number().positive().finite(),
  currentAmount: z.number().nonnegative().finite(),
  deadline: z.coerce.date().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** When set, progress follows the account balance instead of `currentAmount`. */
  accountId: z.string().min(1).nullable().optional(),
});

export async function setGoal(input: z.input<typeof setGoalSchema>) {
  const { id, name, targetAmount, currentAmount, deadline, color, accountId } = setGoalSchema.parse(input);
  const data = { name, targetAmount, currentAmount, deadline: deadline ?? null, color, accountId: accountId ?? null };

  if (id) {
    await prisma.goal.update({
      where: { id },
      data,
    });
  } else {
    await prisma.goal.create({ data });
  }

  revalidatePath("/goals");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGoal(id: string) {
  z.string().min(1).parse(id);
  await prisma.goal.delete({ where: { id } });
  revalidatePath("/goals");
  revalidatePath("/");
  return { ok: true };
}
