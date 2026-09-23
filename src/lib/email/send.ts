import { APP_NAME } from "@/lib/infra/app";
import { getEmailSettings } from "@/lib/infra/settings";
import { logger } from "@/lib/infra/logger";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * Resend's shared sender only delivers to the address that owns the Resend account, which is enough for a
 * personal install. Verifying your own domain there lifts that and lets you use your own sender.
 */
const FROM = process.env.EMAIL_FROM?.trim() || "Finanças <onboarding@resend.dev>";

export class EmailError extends Error {}

/** Sends through Resend, to the address saved in the settings. Throws EmailError with what Resend answered. */
export async function sendToOwner(subject: string, text: string) {
  const { apiKey, to } = await getEmailSettings();
  if (!apiKey || !to) throw new EmailError("E-mail não configurado (Configurações → Entrar por e-mail).");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: `${APP_NAME}: ${subject}`, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body?.message === "string" ? body.message : `HTTP ${res.status}`;
    logger.error("email:failed", { status: res.status, detail });
    throw new EmailError(`Não foi possível enviar o e-mail: ${detail}`);
  }
  logger.info("email:sent", { subject });
}
