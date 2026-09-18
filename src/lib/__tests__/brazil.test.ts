import { describe, it, expect } from "vitest";
import { parseBRLInput, resolveCounterparty, parseInstallmentFromDescription, isTransferMethod } from "@/lib/domain/brazil";

describe("parseBRLInput", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["R$ 1.234,56", 1234.56],
    ["1.234", 1234],
    ["1.234.567", 1234567],
    ["1234.56", 1234.56],
    ["1.5", 1.5],
    ["-50", -50],
    ["0,99", 0.99],
  ])("parses %s", (input, expected) => {
    expect(parseBRLInput(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "R$"])("rejects %j", (input) => {
    expect(parseBRLInput(input)).toBeNull();
  });
});

describe("resolveCounterparty", () => {
  const owner = ["12345678900"];
  const payment = {
    payer: { name: "Maria Silva", documentNumber: { value: "123.456.789-00", type: "CPF" as const } },
    receiver: { name: "Padaria Pão Quente LTDA", documentNumber: { value: "12.345.678/0001-90", type: "CNPJ" as const } },
  };

  it("uses the receiver for outflows and the payer for inflows", () => {
    expect(resolveCounterparty(-30, payment, owner)).toEqual({ name: "Padaria Pão Quente LTDA", type: "CNPJ" });
    expect(resolveCounterparty(30, payment, owner)).toEqual({ name: "Maria Silva", type: "SELF" });
  });

  it("detects a Pix to the owner's own CPF", () => {
    const own = { receiver: { name: "Maria Silva", documentNumber: { value: "12345678900" } } };
    expect(resolveCounterparty(-500, own, owner)).toEqual({ name: "Maria Silva", type: "SELF" });
  });

  it("infers document type from length when missing", () => {
    expect(resolveCounterparty(-1, { receiver: { documentNumber: { value: "98765432100" } } }, owner).type).toBe("CPF");
  });

  it("returns nulls without payment data", () => {
    expect(resolveCounterparty(-1, null, owner)).toEqual({ name: null, type: null });
  });

  it("recognizes transfer methods", () => {
    expect(isTransferMethod("PIX")).toBe(true);
    expect(isTransferMethod("ted")).toBe(true);
    expect(isTransferMethod("BOLETO")).toBe(false);
    expect(isTransferMethod(null)).toBe(false);
  });
});

describe("parseInstallmentFromDescription", () => {
  it.each([
    ["MAGALU PARC 03/12", { number: 3, total: 12 }],
    ["AMAZON MARKETPLACE 02/10", { number: 2, total: 10 }],
    ["Loja X parcela 1 de 6", { number: 1, total: 6 }],
    ["PARC 04/05 CASAS BAHIA", { number: 4, total: 5 }],
  ])("parses %s", (desc, expected) => {
    expect(parseInstallmentFromDescription(desc)).toEqual(expected);
  });

  it.each(["UBER TRIP", "PIX 15/09", "NETFLIX.COM", "LOJA 1/1"])("ignores %s", (desc) => {
    expect(parseInstallmentFromDescription(desc)).toBeNull();
  });
});

import { isCardBillPaymentDescription } from "@/lib/domain/brazil";
import { classifyFlow, spendDelta } from "@/lib/domain/flows";

describe("isCardBillPaymentDescription", () => {
  it.each(["PAGAMENTO RECEBIDO", "Pagamento de fatura", "PGTO DEBITO AUTOMATICO", "PAG FATURA NUBANK"])("matches %s", (d) => {
    expect(isCardBillPaymentDescription(d)).toBe(true);
  });
  it.each(["ESTORNO AMAZON", "PAGAMENTO UBER", "IFOOD"])("ignores %s", (d) => {
    expect(isCardBillPaymentDescription(d)).toBe(false);
  });
});

describe("classifyFlow", () => {
  const card = { type: "CREDIT_CARD" };
  const checking = { type: "CHECKING" };
  it("treats card credits and positive expense-category amounts as refunds", () => {
    expect(classifyFlow({ amount: 50, categoryId: null, account: card, category: null })).toBe("refund");
    expect(classifyFlow({ amount: 50, categoryId: "c", account: checking, category: { isIncome: false } })).toBe("refund");
    expect(spendDelta({ amount: 50, categoryId: null, account: card, category: null })).toBe(-50);
  });
  it("treats income categories and uncategorized deposits as income", () => {
    expect(classifyFlow({ amount: 5000, categoryId: "s", account: checking, category: { isIncome: true } })).toBe("income");
    expect(classifyFlow({ amount: 10, categoryId: "s", account: card, category: { isIncome: true } })).toBe("income");
    expect(classifyFlow({ amount: 200, categoryId: null, account: checking, category: null })).toBe("income");
    expect(spendDelta({ amount: 200, categoryId: null, account: checking, category: null })).toBe(0);
  });
  it("treats negatives as expenses", () => {
    expect(spendDelta({ amount: -80, categoryId: null, account: checking, category: null })).toBe(80);
  });
});

import { futureValue, monthlyRate, realRate } from "@/lib/data/rates";

describe("rates", () => {
  it("compounds monthly to the annual rate", () => {
    expect(Math.pow(1 + monthlyRate(0.12), 12)).toBeCloseTo(1.12, 10);
  });
  it("computes future value with contributions", () => {
    expect(futureValue(1000, 0, 0.1, 12)).toBeCloseTo(1100, 6);
    expect(futureValue(0, 100, 0, 12)).toBe(1200);
  });
  it("discounts inflation", () => {
    expect(realRate(0.1375, 0.045)).toBeCloseTo(0.0885, 4);
  });
});

import { deterministicCategory, expectedInstallmentDate, planInstallmentRedates, type InstallmentRow } from "@/lib/domain/brazil";

describe("deterministicCategory", () => {
  const base = { amount: -100, accountType: "CHECKING", counterpartyType: null, paymentMethod: "OTHER" };
  it.each([
    ["Aplicação RDB", -24807.22, "Investimentos"],
    ["Resgate RDB", 2500, "Investimentos"],
    ["Compra de criptomoedas", -1000, "Investimentos"],
    ["Compra de Renda Variável", -891.25, "Investimentos"],
    ["Valor recebido de Investimentos", 8.52, "Investimentos"],
    ["Resgate caixinha Viagem", 300, "Investimentos"],
    ["ValorRendimentoSaldoRemunerado", 0.02, "Rendimentos"],
    ["VALOR DE RENDIMENTO", 0.01, "Rendimentos"],
    ["EstornoValorRendimentoSaldoRemunerado", -0.01, "Rendimentos"],
    ["CardBankslip", -4000, "Pagamento de fatura"],
    ["InvoiceCreditCardBankslip", -3200, "Pagamento de fatura"],
    ["Pagamento de fatura", -1200, "Pagamento de fatura"],
  ])("%s → %s", (description, amount, expected) => {
    expect(deterministicCategory({ ...base, description, amount })).toBe(expected);
  });

  it.each(["Pix", "Resgate de Cashback", "Compra no débito - PADARIA", "Bankslip", "DEBITO PAGAMENTO"])("leaves %s to the AI", (description) => {
    expect(deterministicCategory({ ...base, description })).toBeNull();
  });

  it("uses counterparty for own transfers and card side for bill payments", () => {
    expect(deterministicCategory({ ...base, description: "Pix", counterpartyType: "SELF", paymentMethod: "PIX" })).toBe("Transferências");
    // inbound from own CPF can be salary moved from an unconnected bank — left for pairing/review
    expect(deterministicCategory({ ...base, amount: 2770.88, description: "Pix", counterpartyType: "SELF", paymentMethod: "PIX" })).toBeNull();
    expect(deterministicCategory({ ...base, description: "Pix", counterpartyType: "CPF", paymentMethod: "PIX" })).toBeNull();
    expect(deterministicCategory({ ...base, accountType: "CREDIT_CARD", amount: 1200, description: "PAGAMENTO RECEBIDO" })).toBe("Pagamento de fatura");
    expect(deterministicCategory({ ...base, accountType: "CREDIT_CARD", amount: 1200, description: "PAGAMENTO" })).toBe("Pagamento de fatura");
    expect(deterministicCategory({ ...base, accountType: "CREDIT_CARD", amount: 90, description: "PAGAMENTO UBER" })).toBeNull();
    expect(deterministicCategory({ ...base, accountType: "CREDIT_CARD", amount: -50, description: "Aplicação RDB" })).toBeNull();
  });
});

describe("planInstallmentRedates", () => {
  const row = (n: number, date: Date, purchaseDate: Date | null, over: Partial<InstallmentRow> = {}): InstallmentRow => ({
    id: `i${n}`, accountId: "card", description: `Amazon Prime ${n}/12`, merchantName: null, amount: -13.9,
    date, installmentNumber: n, totalInstallments: 12, purchaseDate, ...over,
  });

  it("spreads future installments stamped with the purchase date", () => {
    const p = new Date(2026, 2, 1);
    const plan = planInstallmentRedates([row(1, p, p), row(7, new Date(2026, 2, 2), p)]);
    expect(plan).toEqual([{ id: "i7", date: new Date(2026, 8, 1) }]);
  });

  it("repairs installments whose purchaseDate mirrors their own date (double shift)", () => {
    const purchase = new Date(2026, 7, 5);
    const plan = planInstallmentRedates([
      row(1, purchase, purchase),
      row(3, new Date(2026, 11, 5), new Date(2026, 9, 5)), // wrongly pushed to December
      row(12, new Date(2028, 5, 5), new Date(2027, 6, 5)), // wrongly pushed to June 2028
    ]);
    expect(plan).toEqual([
      { id: "i3", date: new Date(2026, 9, 5) },
      { id: "i12", date: new Date(2027, 6, 5) },
    ]);
  });

  it("keeps installments already near their bill date", () => {
    const p = new Date(2026, 2, 1);
    expect(planInstallmentRedates([row(1, p, p), row(4, new Date(2026, 5, 14), p)])).toEqual([]);
  });

  it("skips groups with repeated installment numbers", () => {
    const p = new Date(2026, 2, 1);
    expect(planInstallmentRedates([row(2, p, p, { id: "a" }), row(2, p, p, { id: "b" })])).toEqual([]);
  });

  it("clamps month-end anchors", () => {
    expect(expectedInstallmentDate(new Date(2026, 0, 31), 2)).toEqual(new Date(2026, 1, 28));
  });
});
