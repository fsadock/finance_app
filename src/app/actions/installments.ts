"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/infra/db";

const schema = z.object({
  planKey: z.string().min(1).max(300),
  numbers: z.array(z.number().int().min(1).max(99)).min(1).max(99),
  paid: z.boolean(),
});

/**
 * Marks instalments of a purchase as paid, or takes the mark back.
 *
 * The institution only reports what it has charged; paying a plan off early is something only the owner
 * knows, and without it the app keeps forecasting charges that will never arrive. Settling a whole
 * purchase is this same call over every instalment still open — one idea, not two.
 */
export async function setInstallmentsPaid(input: z.input<typeof schema>) {
  const { planKey, numbers, paid } = schema.parse(input);

  // Delete then insert: marking something already marked must not fail, and SQLite has no upsert-many.
  const clear = prisma.installmentPaid.deleteMany({ where: { planKey, number: { in: numbers } } });
  await (paid
    ? prisma.$transaction([clear, prisma.installmentPaid.createMany({ data: numbers.map((number) => ({ planKey, number })) })])
    : clear);

  revalidatePath("/installments");
  revalidatePath("/next-month");
  revalidatePath("/");
  return { ok: true };
}
