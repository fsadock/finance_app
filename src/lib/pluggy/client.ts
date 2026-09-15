import { PluggyClient } from "pluggy-sdk";

let _client: PluggyClient | null = null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PluggyConfigError extends Error {}

export function getPluggy() {
  if (!_client) {
    const clientId = process.env.PLUGGY_CLIENT_ID?.trim();
    const clientSecret = process.env.PLUGGY_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret || !UUID.test(clientId) || clientSecret.startsWith("your-")) {
      throw new PluggyConfigError(
        "Credenciais da Pluggy não configuradas: defina PLUGGY_CLIENT_ID (UUID) e PLUGGY_CLIENT_SECRET no .env (dashboard.pluggy.ai → Applications) e reinicie o servidor."
      );
    }
    _client = new PluggyClient({ clientId, clientSecret });
  }
  return _client;
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
