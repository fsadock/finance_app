"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/infra/db";
import { z } from "zod";
import { limitInEffect } from "@/lib/data/budgets";
import { monthKey } from "@/lib/domain/format";

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

/** Budgets carry forward, so "remove" means: no budget from this month on (earlier months keep theirs). */
export async function deleteBudget(input: { categoryId: string; startMonth: string }) {
  const { categoryId, startMonth } = deleteBudgetSchema.parse(input);
  await prisma.budget.deleteMany({ where: { categoryId, startMonth } });
  const inherited = await prisma.budget.findFirst({
    where: { categoryId, startMonth: { lt: startMonth } },
    orderBy: { startMonth: "desc" },
  });
  if (inherited && inherited.monthlyLimit > 0) {
    await prisma.budget.create({ data: { categoryId, startMonth, monthlyLimit: 0 } });
  }
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

/**
 * Moves budget between categories for one month only. Because budgets carry forward, the
 * following month gets an explicit row with the original limit (unless it already has one).
 */
export async function applyRebalance(
  startMonth: string,
  moves: { fromId: string; toId: string; amount: number }[]
) {
  const { startMonth: month, moves: validated } = applyRebalanceSchema.parse({ startMonth, moves });
  const categoryIds = [...new Set(validated.flatMap((m) => [m.fromId, m.toId]))];

  const rows = await prisma.budget.findMany({
    where: { categoryId: { in: categoryIds }, startMonth: { lte: month } },
    orderBy: { startMonth: "asc" },
  });
  const original = new Map(categoryIds.map((id) => [id, limitInEffect(rows.filter((r) => r.categoryId === id), month)]));
  const updated = new Map(original);
  for (const m of validated) {
    updated.set(m.fromId, Math.max(0, updated.get(m.fromId)! - m.amount));
    updated.set(m.toId, updated.get(m.toId)! + m.amount);
  }

  const [y, mo] = month.split("-").map(Number);
  const nextMonth = monthKey(new Date(y!, mo!, 1));
  const nextRows = new Set(
    (await prisma.budget.findMany({ where: { categoryId: { in: categoryIds }, startMonth: nextMonth } })).map((r) => r.categoryId)
  );

  await prisma.$transaction(
    categoryIds.flatMap((categoryId) => [
      prisma.budget.upsert({
        where: { categoryId_startMonth: { categoryId, startMonth: month } },
        create: { categoryId, startMonth: month, monthlyLimit: updated.get(categoryId)! },
        update: { monthlyLimit: updated.get(categoryId)! },
      }),
      ...(nextRows.has(categoryId)
        ? []
        : [prisma.budget.create({ data: { categoryId, startMonth: nextMonth, monthlyLimit: original.get(categoryId)! } })]),
    ])
  );
  revalidatePath("/categories");
  revalidatePath("/");
  return { ok: true };
}
