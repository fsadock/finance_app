import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "../settings";

let cached: { key: string; client: Anthropic } | null = null;

/** Anthropic client from the key saved on the setup screen (or .env); null when AI isn't configured. */
export async function getAnthropicOrNull() {
  const { value } = await getSetting("anthropicApiKey");
  if (!value) return null;
  if (cached?.key !== value) cached = { key: value, client: new Anthropic({ apiKey: value }) };
  return cached.client;
}

export async function getAnthropic() {
  const client = await getAnthropicOrNull();
  if (!client) throw new Error("IA não configurada: informe uma chave da Anthropic em Configurações.");
  return client;
}

export const MODEL_FAST = "claude-haiku-4-5-20251001";

/** Human-readable reason an AI call failed (e.g. no credits, invalid key) for the UI. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    const msg = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
    if (/credit balance is too low/i.test(msg)) return "IA indisponível: sem créditos na conta Anthropic (Plans & Billing).";
    if (e.status === 401) return "IA indisponível: chave da Anthropic inválida ou revogada.";
    return `IA indisponível: ${msg}`;
  }
  return `IA indisponível: ${e instanceof Error ? e.message : String(e)}`;
}

/** 1-output-token call that proves a key works and has credits. Returns a user-facing reason, or null. */
export async function testAnthropicKey(apiKey: string): Promise<string | null> {
  if (!apiKey.trim().startsWith("sk-ant-")) return "A chave da Anthropic começa com sk-ant-.";
  try {
    await new Anthropic({ apiKey: apiKey.trim(), maxRetries: 0 }).messages.create({
      model: MODEL_FAST,
      max_tokens: 1,
      messages: [{ role: "user", content: "ok" }],
    });
    return null;
  } catch (e) {
    return aiErrorMessage(e);
  }
}

/**
 * Cheap preflight (1 output token) before destructive AI flows. Returns a user-facing reason when the
 * AI can't be used — not configured, invalid key, no credits — or null when it works.
 */
export async function checkAiAvailable(): Promise<string | null> {
  const { value } = await getSetting("anthropicApiKey");
  if (!value) return "IA indisponível: nenhuma chave da Anthropic configurada.";
  return testAnthropicKey(value);
}
