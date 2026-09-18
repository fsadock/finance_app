import { PluggyClient } from "pluggy-sdk";
import { getPluggyCredentials, isValidPluggyClientId } from "@/lib/infra/settings";

let cached: { key: string; client: PluggyClient } | null = null;

export class PluggyConfigError extends Error {}

/**
 * Pluggy client built from the credentials saved on the setup screen (or .env). Rebuilt when the
 * credentials change, so saving new ones takes effect without restarting the server.
 */
export async function getPluggy() {
  const { clientId, clientSecret, configured } = await getPluggyCredentials();
  if (!configured) {
    throw new PluggyConfigError(
      "Credenciais da Pluggy não configuradas. Abra Configurações (ou /setup) e informe o Client ID e o Client Secret da sua aplicação em dashboard.pluggy.ai."
    );
  }
  const key = `${clientId}:${clientSecret}`;
  if (cached?.key !== key) cached = { key, client: new PluggyClient({ clientId: clientId!, clientSecret: clientSecret! }) };
  return cached.client;
}

/** Tests credentials by creating a real connect token. Returns an error message, or null when they work. */
export async function testPluggyCredentials(clientId: string, clientSecret: string): Promise<string | null> {
  if (!isValidPluggyClientId(clientId)) return "O Client ID deve ser um UUID (ex.: 3f8e2a1c-1234-4abc-9def-0123456789ab).";
  if (!clientSecret.trim()) return "Informe o Client Secret.";
  try {
    await new PluggyClient({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }).createConnectToken();
    return null;
  } catch (e) {
    return pluggyErrorMessage(e);
  }
}

/** Pluggy SDK errors carry the useful message in the response body ("clientId must be a UUID", "Invalid credentials"…). */
export function pluggyErrorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const body = (e as { response?: { body?: unknown } }).response?.body;
    const parsed = typeof body === "string" ? safeJson(body) : body;
    const message = (parsed as { message?: string } | undefined)?.message;
    if (message) return `Pluggy: ${message}`;
  }
  return e instanceof Error ? e.message : "Erro desconhecido";
}

function safeJson(s: string) {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return undefined;
  }
}
