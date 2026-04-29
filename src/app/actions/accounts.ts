"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function setCCMonthlyLimit(limit: number | null) {
  if (!limit || limit <= 0) {
    await prisma.appConfig.deleteMany({ where: { key: "cc_monthly_limit" } });
  } else {
    await prisma.appConfig.upsert({
      where: { key: "cc_monthly_limit" },
      update: { value: String(limit) },
      create: { key: "cc_monthly_limit", value: String(limit) },
    });
  }
  revalidatePath("/");
  revalidatePath("/accounts");
  return { ok: true };
}
