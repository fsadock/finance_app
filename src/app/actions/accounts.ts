"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { deleteConfig, setConfig } from "@/lib/config";
import { z } from "zod";

const setCCMonthlyLimitSchema = z.number().positive().nullable();
const setCCCycleCloseDaySchema = z.number().int().min(1).max(28).nullable();

export async function setCCMonthlyLimit(limit: number | null) {
  const parsed = setCCMonthlyLimitSchema.parse(limit);
  await (parsed && parsed > 0 ? setConfig("ccMonthlyLimit", String(parsed)) : deleteConfig("ccMonthlyLimit"));
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}

export async function setCCCycleCloseDay(day: number | null) {
  const validated = setCCCycleCloseDaySchema.parse(day);
  await (validated ? setConfig("ccCycleCloseDay", String(validated)) : deleteConfig("ccCycleCloseDay"));
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}

export async function setAccountHidden(accountId: string, hidden: boolean) {
  const id = z.string().min(1).parse(accountId);
  await prisma.account.update({ where: { id }, data: { hidden: z.boolean().parse(hidden) } });
  revalidatePath("/", "layout");
  return { ok: true };
}
