"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteSetting, getPluggyCredentials, getSetting, saveSetting } from "@/lib/infra/settings";
import { testPluggyCredentials } from "@/lib/pluggy/client";
import { testAnthropicKey } from "@/lib/ai/client";

type Result = { ok: true; message: string } | { ok: false; error: string };

const text = z.string().max(500);

/**
 * Tests the Pluggy credentials against the real API and saves them only if they work.
 * An empty secret keeps the one already configured (the settings screen never receives it).
 */
export async function savePluggyCredentials(clientId: string, clientSecret: string): Promise<Result> {
  const id = text.parse(clientId).trim();
  let secret = text.parse(clientSecret).trim();
  if (!secret) secret = (await getPluggyCredentials()).clientSecret ?? "";

  const error = await testPluggyCredentials(id, secret);
  if (error) return { ok: false, error };

  await Promise.all([saveSetting("pluggyClientId", id), saveSetting("pluggyClientSecret", secret)]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Credenciais da Pluggy válidas e salvas." };
}

export async function saveAnthropicKey(apiKey: string): Promise<Result> {
  const key = text.parse(apiKey).trim();
  const error = await testAnthropicKey(key);
  if (error) return { ok: false, error };
  await saveSetting("anthropicApiKey", key);
  revalidatePath("/", "layout");
  return { ok: true, message: "Chave da Anthropic válida e salva." };
}

export async function removeAnthropicKey(): Promise<Result> {
  await deleteSetting("anthropicApiKey");
  revalidatePath("/", "layout");
  const stillFromEnv = (await getSetting("anthropicApiKey")).source === "env";
  return stillFromEnv
    ? { ok: true, message: "Chave removida do app, mas ANTHROPIC_API_KEY ainda está definida no .env e continua sendo usada." }
    : { ok: true, message: "Chave removida. O app segue funcionando sem IA." };
}

/** Re-tests what is currently configured (app or .env) without changing anything. */
export async function testCurrentSettings() {
  const [pluggy, anthropic] = await Promise.all([getPluggyCredentials(), getSetting("anthropicApiKey")]);
  const [pluggyError, aiError] = await Promise.all([
    pluggy.clientId && pluggy.clientSecret ? testPluggyCredentials(pluggy.clientId, pluggy.clientSecret) : "Não configurada.",
    anthropic.value ? testAnthropicKey(anthropic.value) : null,
  ]);
  return { pluggyError, aiError, aiConfigured: Boolean(anthropic.value) };
}
