export function normalizeMerchant(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(parc|parcela)\s*\d+\/\d+\b/gi, "")
    .replace(/\d+/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Less aggressive normalization specifically for grouping potential recurrings.
 * Strips common prefixes but keeps more structure than normalizeMerchant.
 */
export function normalizeForGrouping(s: string): string {
  if (!s) return "";
  let n = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d+/g, "") // remove numbers (dates, parts, etc)
    .replace(/[^a-z\s]/g, " ") // replace symbols with space
    .replace(/\s+/g, " ")
    .trim();

  // Strip common banking/transactional prefixes that don't help identify the merchant
  const prefixes = [
    /^pix (enviado|recebido) \w+ /i,
    /^pix (enviado|recebido) /i,
    /^ted (enviada|recebida) \w+ /i,
    /^ted /i,
    /^doc /i,
    /^pagamento /i,
    /^compra /i,
    /^debito /i,
    /^credito /i,
    /^lancamento /i,
    /^tarifa /i,
    /^estorno /i,
  ];

  for (const p of prefixes) {
    n = n.replace(p, "");
  }

  return n.trim();
}

/** Words banks use for the payment rail itself, not the merchant ("Pix", "PIX CASH OUT EXTERNO TERC", "Bankslip"…). */
const GENERIC_WORDS = new Set([
  "pix", "cash", "out", "in", "externo", "externa", "terc", "terceiros", "ted", "doc", "tef", "bankslip", "boleto",
  "transferencia", "transf", "enviado", "enviada", "recebido", "recebida", "pagamento", "pagto", "pgto", "pag",
  "compra", "debito", "credito", "qr", "code", "agendado", "agendamento", "de", "para", "a", "o",
]);

export function isGenericDescription(normalized: string) {
  const words = normalized.split(" ").filter(Boolean);
  return words.every((w) => GENERIC_WORDS.has(w));
}

type PatternInput = { description: string; merchantRaw?: string | null; counterpartyName?: string | null };

/**
 * Key for merchant rules. When the description only names the payment rail ("Pix"), the counterparty
 * is what identifies the merchant — without one, returns "" so no rule is ever created for "pix".
 */
export function merchantPattern(t: PatternInput): string {
  const base = normalizeMerchant(t.merchantRaw ?? t.description);
  if (!isGenericDescription(base)) return base;
  const counterparty = t.counterpartyName ? normalizeMerchant(t.counterpartyName) : "";
  return counterparty ? `${base} ${counterparty}`.trim() : "";
}

/** Same idea for recurring grouping: all "Pix" must not collapse into a single recurring. */
export function groupingKey(t: PatternInput): string {
  const base = normalizeForGrouping(t.description);
  if (!isGenericDescription(base)) return base;
  const counterparty = t.counterpartyName ? normalizeForGrouping(t.counterpartyName) : "";
  return counterparty ? `${base} ${counterparty}`.trim() : "";
}
