"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/infra/db";
import { issueCode } from "@/lib/auth/enrollment";
import { endCurrentSession } from "@/lib/auth/session";

/** A code the new device types on the sign-in page to register its own passkey. */
export async function createDeviceCode() {
  const { code, expiresAt } = issueCode();
  return { code, expiresAt: expiresAt.toISOString() };
}

/** Removing a passkey also signs out every browser that used it. */
export async function removeDevice(passkeyId: string) {
  await prisma.passkey.delete({ where: { id: z.string().min(1).parse(passkeyId) } });
  revalidatePath("/settings");
}

export async function signOut() {
  await endCurrentSession();
  redirect("/login");
}
