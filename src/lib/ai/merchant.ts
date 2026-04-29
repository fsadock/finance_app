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
