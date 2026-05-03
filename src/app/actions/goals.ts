"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";

const setGoalSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(100).trim(),
  targetAmount: z.number().positive().finite(),
  currentAmount: z.number().nonnegative().finite(),
  deadline: z.coerce.date().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function setGoal(input: {
  id?: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: Date;
  color?: string;
}) {
  const { id, name, targetAmount, currentAmount, deadline, color } = setGoalSchema.parse(input);

  if (id) {
    await prisma.goal.update({
      where: { id },
      data: { name, targetAmount, currentAmount, deadline, color },
    });
  } else {
    await prisma.goal.create({
      data: { name, targetAmount, currentAmount, deadline, color },
    });
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
