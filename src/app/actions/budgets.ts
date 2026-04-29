"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function setBudget(input: {
  categoryId: string;
  monthlyLimit: number;
  startMonth: string;
}) {
  const limit = Number(input.monthlyLimit);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Valor inválido");

  await prisma.budget.upsert({
    where: { categoryId_startMonth: { categoryId: input.categoryId, startMonth: input.startMonth } },
    create: {
      categoryId: input.categoryId,
      startMonth: input.startMonth,
      monthlyLimit: limit,
    },
    update: { monthlyLimit: limit },
  });

  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteBudget(input: { categoryId: string; startMonth: string }) {
  await prisma.budget.deleteMany({
    where: { categoryId: input.categoryId, startMonth: input.startMonth },
  });
  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleRollover(categoryId: string, enabled: boolean) {
  await prisma.category.update({
    where: { id: categoryId },
    data: { rolloverEnabled: enabled },
  });
  revalidatePath("/categories");
  return { ok: true };
}

export async function applyRebalance(
  startMonth: string,
  moves: { fromId: string; toId: string; amount: number }[]
) {
  await prisma.$transaction(
    moves.flatMap((m) => [
      prisma.budget.update({
        where: { categoryId_startMonth: { categoryId: m.fromId, startMonth } },
        data: { monthlyLimit: { decrement: m.amount } },
      }),
      prisma.budget.update({
        where: { categoryId_startMonth: { categoryId: m.toId, startMonth } },
        data: { monthlyLimit: { increment: m.amount } },
      }),
    ])
  );
  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}
