/**
 * Brazil-specific parsing of bank data: Pix/TED counterparties (CPF vs CNPJ), card installments
 * ("parcelado"), and pt-BR money input.
 */

export const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * Parses money typed the Brazilian way: "1.234,56", "1234,56", "R$ 1.234", "-50".
 * Also accepts "1234.56". A single dot followed by exactly 3 digits is a thousands separator ("1.234" = 1234).
 */
export function parseBRLInput(input: string): number | null {
  let s = input.replace(/R\$|\s/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1 || /^-?\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type Participant = { name?: string; documentNumber?: { value?: string; type?: "CPF" | "CNPJ" } } | undefined;

export type Counterparty = { name: string | null; type: "SELF" | "CPF" | "CNPJ" | null };

/** The other side of a payment: the receiver for money out, the payer for money in. */
export function resolveCounterparty(
  amount: number,
  payment: { payer?: Participant; receiver?: Participant } | null | undefined,
  ownerDocuments: string[]
): Counterparty {
  const party = amount < 0 ? payment?.receiver : payment?.payer;
  if (!party) return { name: null, type: null };
  const doc = onlyDigits(party.documentNumber?.value);
  const docType = party.documentNumber?.type ?? (doc.length === 14 ? "CNPJ" : doc.length === 11 ? "CPF" : null);
  const isSelf = doc.length > 0 && ownerDocuments.includes(doc);
  return { name: party.name?.trim() || null, type: isSelf ? "SELF" : docType };
}

/** PIX / TED / DOC / TEF — the methods where "to my own CPF" means a transfer between own accounts. */
export function isTransferMethod(method: string | null | undefined) {
  return /\b(PIX|TED|DOC|TEF)\b/i.test(method ?? "");
}

export type InstallmentInfo = { number: number; total: number };

/**
 * Installment "n/N" from a card description ("LOJA X PARC 03/12", "LOJA X 03/12").
 * Only meaningful for credit card transactions — elsewhere "15/09" is usually a date.
 */
export function parseInstallmentFromDescription(description: string): InstallmentInfo | null {
  const m = description.match(/(?:\bparc(?:ela)?\.?\s*)?\b(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i)
    ?? description.match(/\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/i);
  if (!m) return null;
  const number = Number(m[1]);
  const total = Number(m[2]);
  if (total < 2 || total > 48 || number < 1 || number > total) return null;
  return { number, total };
}

/** Credit card side of a bill payment ("PAGAMENTO RECEBIDO", "PAG FATURA", "PGTO DEBITO AUTOMATICO"). */
export function isCardBillPaymentDescription(description: string) {
  return (
    /\b(pagamento|pagto|pgto|pag)\b.*\b(recebido|fatura|efetuado|debito automatico|débito automático)\b|\bpagamento de fatura\b|\bpagamento recebido\b/i.test(description) ||
    /^\s*(pagamento|pagto|pgto)\s*$/i.test(description)
  );
}

/**
 * Classifications that don't need AI — they come from how Brazilian banks label movements.
 * Returns the category name to apply, or null to leave the transaction for rules/AI.
 * Descriptions seen in real data: "Aplicação RDB", "Resgate RDB", "Compra de criptomoedas",
 * "Compra de Renda Variável", "ValorRendimentoSaldoRemunerado", "CardBankslip", "PAGAMENTO RECEBIDO".
 */
export function deterministicCategory(t: {
  description: string;
  amount: number;
  accountType: string;
  counterpartyType: string | null;
  paymentMethod: string | null;
}): "Transferências" | "Pagamento de fatura" | "Investimentos" | "Rendimentos" | null {
  const d = t.description.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Money sent to the owner's own CPF is a transfer. Money *arriving* from the owner's CPF is not decided here:
  // it may be salary received at an unconnected bank and moved over — transfer pairing decides it instead.
  if (t.counterpartyType === "SELF" && t.amount < 0 && isTransferMethod(t.paymentMethod)) return "Transferências";

  if (t.accountType === "CREDIT_CARD") {
    return t.amount > 0 && isCardBillPaymentDescription(t.description) ? "Pagamento de fatura" : null;
  }

  // card bill paid from a bank account (boleto of the card or direct debit)
  if (t.amount < 0 && (/cardbankslip/.test(d) || /\bpagamento de fatura\b|\bpag(to)? fatura\b/.test(d))) {
    return "Pagamento de fatura";
  }

  // yield on remunerated balance (Nubank, Mercado Pago…) — tiny daily amounts, including their reversals
  if (/rendimentosaldoremunerado|\bvalor de rendimento\b|estorno do valor de rendimento/.test(d)) return "Rendimentos";

  // money moving between the account and investments: not income, not spending
  if (
    /\b(aplicacao|resgate)\b.*\b(rdb|cdb|lci|lca|lc|tesouro|caixinha|poupanca|fundo|porquinho|cofrinho)\b/.test(d) ||
    /^(aplicacao|resgate) (rdb|cdb)$/.test(d) ||
    /\b(compra|venda) de (criptomoedas?|renda variavel|renda fixa|titulos?|acoes|fii|cotas?)\b/.test(d) ||
    /\bvalor recebido de investimentos\b|\btesouro direto\b/.test(d)
  ) {
    return "Investimentos";
  }
  return null;
}

/** Installment n of a purchase made on `anchor` belongs ~n−1 months later (month-end clamped). */
export function expectedInstallmentDate(anchor: Date, installmentNumber: number): Date {
  const d = new Date(anchor.getFullYear(), anchor.getMonth() + installmentNumber - 1, 1, anchor.getHours(), anchor.getMinutes());
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(anchor.getDate(), lastDay));
  return d;
}

export type InstallmentRow = {
  id: string;
  accountId: string;
  description: string;
  merchantName: string | null;
  amount: number;
  date: Date;
  installmentNumber: number | null;
  totalInstallments: number | null;
  purchaseDate: Date | null;
};

/**
 * Card connectors are inconsistent about installment dates: some stamp every future installment with the
 * purchase date, others set `purchaseDate` equal to the installment's own date. A single row can't tell
 * which, so this works per purchase: the earliest purchase/first-installment date in the group is the
 * anchor, and any installment more than 20 days from anchor + (n−1) months is re-dated.
 * Groups with a repeated installment number (two identical purchases) are skipped.
 */
export function planInstallmentRedates(rows: InstallmentRow[]): { id: string; date: Date }[] {
  const groups = new Map<string, InstallmentRow[]>();
  for (const r of rows) {
    if (!r.installmentNumber || !r.totalInstallments || r.totalInstallments < 2) continue;
    const merchant = (r.merchantName ?? r.description)
      .toLowerCase()
      .replace(/\b(parc(ela)?\.?\s*)?\d{1,2}\s*(\/|de)\s*\d{1,2}\b/g, "")
      .replace(/[^a-z]/g, "");
    const key = [r.accountId, merchant, r.totalInstallments, Math.round(Math.abs(r.amount) * 100)].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const out: { id: string; date: Date }[] = [];
  for (const list of groups.values()) {
    const numbers = list.map((r) => r.installmentNumber!);
    if (new Set(numbers).size !== numbers.length) continue;
    const candidates = list.flatMap((r) => [
      ...(r.purchaseDate ? [r.purchaseDate.getTime()] : []),
      ...(r.installmentNumber === 1 ? [r.date.getTime()] : []),
    ]);
    if (candidates.length === 0) continue;
    const anchor = new Date(Math.min(...candidates));
    for (const r of list) {
      const expected = expectedInstallmentDate(anchor, r.installmentNumber!);
      if (Math.abs(r.date.getTime() - expected.getTime()) > 20 * 86_400_000) out.push({ id: r.id, date: expected });
    }
  }
  return out;
}
