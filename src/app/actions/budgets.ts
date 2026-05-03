"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const setBudgetSchema = z.object({
  categoryId: z.string().min(1),
  monthlyLimit: z.number().nonnegative().finite(),
  startMonth: z.string().regex(monthPattern, "startMonth must be YYYY-MM"),
});

const deleteBudgetSchema = z.object({
  categoryId: z.string().min(1),
  startMonth: z.string().regex(monthPattern, "startMonth must be YYYY-MM"),
});

const applyRebalanceSchema = z.object({
  startMonth: z.string().regex(monthPattern, "startMonth must be YYYY-MM"),
  moves: z.array(
    z.object({
      fromId: z.string().min(1),
      toId: z.string().min(1),
      amount: z.number().positive().finite(),
    })
  ).min(1),
});

export async function setBudget(input: {
  categoryId: string;
  monthlyLimit: number;
  startMonth: string;
}) {
  const { categoryId, monthlyLimit, startMonth } = setBudgetSchema.parse(input);

  await prisma.budget.upsert({
    where: { categoryId_startMonth: { categoryId, startMonth } },
    create: { categoryId, startMonth, monthlyLimit },
    update: { monthlyLimit },
  });

  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteBudget(input: { categoryId: string; startMonth: string }) {
  const { categoryId, startMonth } = deleteBudgetSchema.parse(input);
  await prisma.budget.deleteMany({ where: { categoryId, startMonth } });
  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleRollover(categoryId: string, enabled: boolean) {
  const id = z.string().min(1).parse(categoryId);
  const on = z.boolean().parse(enabled);
  await prisma.category.update({ where: { id }, data: { rolloverEnabled: on } });
  revalidatePath("/categories");
  return { ok: true };
}

export async function applyRebalance(
  startMonth: string,
  moves: { fromId: string; toId: string; amount: number }[]
) {
  const { startMonth: month, moves: validated } = applyRebalanceSchema.parse({ startMonth, moves });

  await prisma.$transaction(
    validated.flatMap((m) => [
      prisma.budget.update({
        where: { categoryId_startMonth: { categoryId: m.fromId, startMonth: month } },
        data: { monthlyLimit: { decrement: m.amount } },
      }),
      prisma.budget.update({
        where: { categoryId_startMonth: { categoryId: m.toId, startMonth: month } },
        data: { monthlyLimit: { increment: m.amount } },
      }),
    ])
  );
  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}
