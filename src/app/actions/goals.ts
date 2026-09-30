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
  /** When set, progress follows every visible account of this kind. Wins over `accountId`. */
  accountType: z.enum(["CHECKING", "SAVINGS", "INVESTMENT", "CASH", "LOAN"]).nullable().optional(),
});

export async function setGoal(input: z.input<typeof setGoalSchema>) {
  const { id, name, targetAmount, currentAmount, deadline, color, accountId, accountType } = setGoalSchema.parse(input);
  // The two are exclusive: following a kind means following every account in it, not one of them.
  const data = {
    name,
    targetAmount,
    currentAmount,
    deadline: deadline ?? null,
    color,
    accountType: accountType ?? null,
    accountId: accountType ? null : (accountId ?? null),
  };

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
