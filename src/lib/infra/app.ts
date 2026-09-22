/**
 * Name of this copy of the app (compose: FINANCAS_INSTANCE), when more than one runs on the same address —
 * e.g. one per person. It keeps their sessions and passkeys apart and labels the app, so a password manager
 * doesn't treat two people's passkeys as the same account. Empty on a single install.
 *
 * Server-side only: pass APP_NAME to client components as a prop.
 */
const INSTANCE = (process.env.FINANCAS_INSTANCE ?? "").trim();

/** "Finanças" or "Finanças · Maria". */
export const APP_NAME = INSTANCE ? `Finanças · ${INSTANCE}` : "Finanças";

/** The instance as a key: lowercase letters, digits and underscores. Empty on a single install. */
export const INSTANCE_KEY = INSTANCE.toLowerCase()
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_|_$/g, "");
