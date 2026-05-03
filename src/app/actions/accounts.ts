"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";

const setCCMonthlyLimitSchema = z.number().positive().nullable();
const setCCCycleCloseDaySchema = z.number().int().min(1).max(28).nullable();

export async function setCCMonthlyLimit(limit: number | null) {
  const parsed = setCCMonthlyLimitSchema.parse(limit);
  if (!parsed || parsed <= 0) {
    await prisma.appConfig.deleteMany({ where: { key: "cc_monthly_limit" } });
  } else {
    await prisma.appConfig.upsert({
      where: { key: "cc_monthly_limit" },
      update: { value: String(parsed) },
      create: { key: "cc_monthly_limit", value: String(parsed) },
    });
  }
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}

export async function setCCCycleCloseDay(day: number | null) {
  const validated = setCCCycleCloseDaySchema.parse(day);
  if (!validated) {
    await prisma.appConfig.deleteMany({ where: { key: "cc_cycle_close_day" } });
  } else {
    await prisma.appConfig.upsert({
      where: { key: "cc_cycle_close_day" },
      update: { value: String(validated) },
      create: { key: "cc_cycle_close_day", value: String(validated) },
    });
  }
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}
