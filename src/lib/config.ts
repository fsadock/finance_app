import { prisma } from "./db";

/** Every key the app stores in the AppConfig table. These strings appear nowhere else. */
const CONFIG_KEYS = {
  /** Monthly spending goal for all credit cards (number). */
  ccMonthlyLimit: "cc_monthly_limit",
  /** Day of the month card bills close (1–28). */
  ccCycleCloseDay: "cc_cycle_close_day",
  /** Owner's CPF/CNPJ digits (JSON array), to recognize transfers between own accounts. */
  ownerDocuments: "owner_documents",
  /** Restore point of the last "Reclassificar com IA" (JSON). */
  reclassifyBackup: "reclassify_backup",
  pluggyClientId: "setting:pluggy_client_id",
  pluggyClientSecret: "setting:pluggy_client_secret",
  anthropicApiKey: "setting:anthropic_api_key",
} as const;

type ConfigName = keyof typeof CONFIG_KEYS;

export async function getConfig(name: ConfigName): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEYS[name] } });
  return row?.value ?? null;
}

export async function getConfigNumber(name: ConfigName): Promise<number | null> {
  const value = await getConfig(name);
  const n = value === null ? NaN : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Not async: returns the Prisma operation, so it can also run inside `prisma.$transaction([...])`. */
export function setConfig(name: ConfigName, value: string) {
  const key = CONFIG_KEYS[name];
  return prisma.appConfig.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Not async, like setConfig. Deleting a key that isn't set is fine. */
export function deleteConfig(name: ConfigName) {
  return prisma.appConfig.deleteMany({ where: { key: CONFIG_KEYS[name] } });
}
