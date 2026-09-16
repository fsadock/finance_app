"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { previewReclassify, runReclassify, undoReclassify } from "@/lib/reclassify";

export async function previewReclassifyAction() {
  return previewReclassify();
}

export async function runReclassifyAction(confirmation: string) {
  if (!checkRateLimit("reclassify", 2, 3_600_000)) return { ok: false as const, error: "Muitas tentativas; aguarde uma hora." };
  const result = await runReclassify(z.string().max(50).parse(confirmation));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function undoReclassifyAction() {
  const result = await undoReclassify();
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
