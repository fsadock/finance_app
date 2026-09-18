"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/infra/db";
import { z } from "zod";
import { parseDateInput } from "@/lib/domain/format";
import { CADENCES, nextDueDate, type AutoChangeRecord, type Cadence } from "@/lib/domain/recurrence";
import type { RecurringCadence } from "@/generated/prisma/enums";

// The shared cadence list must match the database enum exactly.
const sameCadences: [Cadence, RecurringCadence] extends [RecurringCadence, Cadence] ? true : never = true;
void sameCadences;

const idSchema = z.string().min(1);

function revalidate() {
  revalidatePath("/recurrings");
  revalidatePath("/");
}

export async function setRecurringActive(id: string, active: boolean) {
  await prisma.recurring.update({ where: { id: idSchema.parse(id) }, data: { active: z.boolean().parse(active) } });
  revalidate();
  return { ok: true };
}

/** Deletes a recurring and unlinks its transactions (they may be re-detected on the next sync). */
export async function deleteRecurring(id: string) {
  const rid = idSchema.parse(id);
  await prisma.$transaction([
    prisma.transaction.updateMany({ where: { recurringId: rid }, data: { recurringId: null, isRecurring: false } }),
    prisma.recurring.delete({ where: { id: rid } }),
  ]);
  revalidate();
  return { ok: true };
}

const updateSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Informe um nome").max(80),
  /** Per charge, always positive here; the sign (expense/income) is kept from the recurring. */
  amount: z.number().positive("Valor inválido").max(10_000_000),
  cadence: z.enum(CADENCES),
  /** "YYYY-MM-DD" */
  nextDate: z.string(),
  categoryId: z.string().min(1).nullable(),
});

/**
 * Saves the user's version of a recurring. It wins over automatic changes until a newer charge
 * arrives (see refreshRecurrings).
 */
export async function updateRecurring(input: z.input<typeof updateSchema>) {
  const d = updateSchema.parse(input);
  const nextDate = parseDateInput(d.nextDate);
  if (!nextDate) throw new Error("Data da próxima cobrança inválida");
  const current = await prisma.recurring.findUniqueOrThrow({ where: { id: d.id }, select: { amount: true } });
  await prisma.recurring.update({
    where: { id: d.id },
    data: {
      name: d.name,
      amount: Math.sign(current.amount || -1) * d.amount,
      cadence: d.cadence,
      nextDate,
      categoryId: d.categoryId,
      editedAt: new Date(),
      autoChange: null,
    },
  });
  revalidate();
  return { ok: true };
}

/** Reverts the last automatic change and remembers it, so the next sync doesn't apply it again. */
export async function undoRecurringAutoChange(id: string) {
  const r = await prisma.recurring.findUniqueOrThrow({ where: { id: idSchema.parse(id) } });
  if (!r.autoChange) return { ok: false as const };
  const change = JSON.parse(r.autoChange) as AutoChangeRecord;
  const cadence = change.from.cadence as Cadence;
  await prisma.recurring.update({
    where: { id: r.id },
    data: {
      cadence,
      amount: change.from.amount,
      nextDate: r.lastDate ? nextDueDate(r.lastDate, cadence) : r.nextDate,
      autoChange: null,
      rejectedChange: change.key,
    },
  });
  revalidate();
  return { ok: true as const };
}
