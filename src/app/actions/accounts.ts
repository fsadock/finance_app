"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { z } from "zod";

const setCCMonthlyLimitSchema = z.number().positive().nullable();

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
  if (!day || day < 1 || day > 28) {
    await prisma.appConfig.deleteMany({ where: { key: "cc_cycle_close_day" } });
  } else {
    await prisma.appConfig.upsert({
      where: { key: "cc_cycle_close_day" },
      update: { value: String(day) },
      create: { key: "cc_cycle_close_day", value: String(day) },
    });
  }
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}
