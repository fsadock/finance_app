import { prisma } from "@/lib/infra/db";
import { deleteConfig, getConfig, setConfig } from "@/lib/infra/config";

/**
 * Credentials the app needs. Saved from the setup screen into AppConfig (the local SQLite file);
 * `.env` values are the fallback, so existing installs keep working without the setup screen.
 */
/** Each credential's AppConfig entry (see config.ts) and its .env fallback. */
const SETTINGS = {
  pluggyClientId: { env: "PLUGGY_CLIENT_ID" },
  pluggyClientSecret: { env: "PLUGGY_CLIENT_SECRET" },
  anthropicApiKey: { env: "ANTHROPIC_API_KEY" },
} as const;

type SettingName = keyof typeof SETTINGS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Values copied from .env.example or left empty don't count as configured. */
export function isPlaceholder(value: string | null | undefined): boolean {
  const v = value?.trim();
  return !v || v === "sk-ant-..." || v.startsWith("your-") || v === "00000000-0000-0000-0000-000000000000";
}

export function isValidPluggyClientId(value: string) {
  return UUID.test(value.trim());
}

/** App-saved value wins over .env; placeholders are ignored on both sides. */
export function resolveSetting(appValue: string | null | undefined, envValue: string | null | undefined) {
  if (!isPlaceholder(appValue)) return { value: appValue!.trim(), source: "app" as const };
  if (!isPlaceholder(envValue)) return { value: envValue!.trim(), source: "env" as const };
  return { value: null, source: null };
}

/** Only the last 4 characters ever leave the server. */
export function maskSecret(value: string | null) {
  if (!value) return null;
  return `••••••${value.slice(-4)}`;
}

export async function getSetting(name: SettingName) {
  return resolveSetting(await getConfig(name), process.env[SETTINGS[name].env]);
}

export async function saveSetting(name: SettingName, value: string) {
  await setConfig(name, value.trim());
}

export async function deleteSetting(name: SettingName) {
  await deleteConfig(name);
}

export async function getPluggyCredentials() {
  const [id, secret] = await Promise.all([getSetting("pluggyClientId"), getSetting("pluggyClientSecret")]);
  const configured = Boolean(id.value && secret.value && isValidPluggyClientId(id.value));
  return { clientId: id.value, clientSecret: secret.value, configured, source: id.source ?? secret.source };
}

/** What the setup/settings screens may show — never the secrets themselves. */
export async function getSetupStatus() {
  const [pluggy, anthropic, connections] = await Promise.all([
    getPluggyCredentials(),
    getSetting("anthropicApiKey"),
    prisma.pluggyItem.count(),
  ]);
  return {
    pluggy: {
      configured: pluggy.configured,
      source: pluggy.source,
      clientId: pluggy.clientId,
      clientSecretMasked: maskSecret(pluggy.clientSecret),
    },
    ai: { configured: Boolean(anthropic.value), source: anthropic.source, keyMasked: maskSecret(anthropic.value) },
    connections,
  };
}

export type SetupStatus = Awaited<ReturnType<typeof getSetupStatus>>;
