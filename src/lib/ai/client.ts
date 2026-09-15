import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY missing in env");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export const MODEL_FAST = "claude-haiku-4-5-20251001";

/** Human-readable reason an AI call failed (e.g. no credits, invalid key) for the UI. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    const msg = (e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message;
    if (/credit balance is too low/i.test(msg)) return "IA indisponível: sem créditos na conta Anthropic (Plans & Billing).";
    if (e.status === 401) return "IA indisponível: ANTHROPIC_API_KEY inválida.";
    return `IA indisponível: ${msg}`;
  }
  return `IA indisponível: ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * Cheap preflight (1 output token) before destructive AI flows. Returns a user-facing reason when the
 * AI can't be used — missing key, invalid key, no credits — or null when it works.
 */
export async function checkAiAvailable(): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || key === "sk-ant-...") return "IA indisponível: ANTHROPIC_API_KEY não configurada.";
  try {
    await getAnthropic().messages.create({ model: MODEL_FAST, max_tokens: 1, messages: [{ role: "user", content: "ok" }] });
    return null;
  } catch (e) {
    return aiErrorMessage(e);
  }
}
