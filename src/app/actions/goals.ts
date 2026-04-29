"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function setGoal(input: {
  id?: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: Date;
  color?: string;
}) {
  if (input.id) {
    await prisma.goal.update({
      where: { id: input.id },
      data: {
        name: input.name,
        targetAmount: input.targetAmount,
        currentAmount: input.currentAmount,
        deadline: input.deadline,
        color: input.color,
      },
    });
  } else {
    await prisma.goal.create({
      data: {
        name: input.name,
        targetAmount: input.targetAmount,
        currentAmount: input.currentAmount,
        deadline: input.deadline,
        color: input.color,
      },
    });
  }

  revalidatePath("/goals");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteGoal(id: string) {
  await prisma.goal.delete({ where: { id } });
  revalidatePath("/goals");
  revalidatePath("/");
  return { ok: true };
}
