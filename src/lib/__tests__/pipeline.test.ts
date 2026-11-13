// Runs the post-sync pipeline (deterministic rules → transfers → categorize → recurrings) on a real,
// migrated SQLite database, with Claude mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BUDGET_RELEVANT } from "@/lib/domain/flows";
import { merchantPattern } from "@/lib/domain/merchant";

const dir = mkdtempSync(path.join(tmpdir(), "financas-pipeline-"));
const DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = DATABASE_URL;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const parse = vi.fn();
const ai = vi.hoisted(() => ({ configured: true }));
vi.mock("@/lib/ai/client", () => ({
  getAnthropicOrNull: async () => (ai.configured ? {} : null),
  getAnthropic: async () => ({ messages: { parse } }),
  MODEL_FAST: "test-model",
  aiErrorMessage: (e: unknown) => `IA indisponível: ${e instanceof Error ? e.message : String(e)}`,
}));

const passThrough = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/jobs/pass-through", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/jobs/pass-through")>();
  return {
    applyPassThroughs: async () => {
      if (passThrough.fail) throw new Error("database is locked");
      return real.applyPassThroughs();
    },
  };
});

type Db = typeof import("@/lib/infra/db")["prisma"];
let prisma: Db;
let runPostSyncJobs: typeof import("@/lib/jobs/pipeline")["runPostSyncJobs"];

/** Whether the transaction weighs on the budget, asked the way every report asks it. */
const counts = async (id: string) => (await prisma.transaction.count({ where: { AND: [{ id }, BUDGET_RELEVANT] } })) === 1;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};

/** Mocked Claude: categorizes by description; detects no new recurrings. */
function claude(byDescription: Record<string, { category: string; confidence: number }>) {
  parse.mockImplementation(async (req: { messages: { content: string }[] }) => {
    const content = req.messages[0]!.content;
    const usage = { input_tokens: 1, output_tokens: 1 };
    if (!content.startsWith("Classifique")) return { stop_reason: "end_turn", parsed_output: { detected: [] }, usage };
    const suggestions = content
      .split("\n")
      .filter((l) => l.startsWith("id="))
      .map((l) => {
        const [id, description] = l.split(" | ");
        const s = byDescription[description!]!;
        return { txId: id!.slice(3), categoryName: s.category, confidence: s.confidence };
      });
    return { stop_reason: "end_turn", parsed_output: { suggestions }, usage };
  });
}

beforeAll(async () => {
  execSync("node_modules/.bin/prisma migrate deploy", { env: { ...process.env, DATABASE_URL }, stdio: "ignore" });
  ({ prisma } = await import("@/lib/infra/db"));
  ({ runPostSyncJobs } = await import("@/lib/jobs/pipeline"));
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

let ids: Record<string, string>;

beforeEach(async () => {
  for (const table of ["transaction", "recurring", "merchantRule", "account", "category"] as const) {
    await (prisma[table] as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  const cat = (name: string, excludeFromBudget = false) =>
    prisma.category.create({ data: { name, excludeFromBudget } }).then((c) => c.id);
  ids = {
    mercado: await cat("Mercado"),
    outros: await cat("Outros"),
    tecnologia: await cat("Tecnologia & Software"),
    transferencias: await cat("Transferências", true),
    investimentos: await cat("Investimentos", true),
    fatura: await cat("Pagamento de fatura", true),
    rendimentos: await cat("Rendimentos"),
  };
  const account = (name: string) =>
    prisma.account.create({ data: { name, type: "CHECKING", institution: name } }).then((a) => a.id);
  ids.btg = await account("BTG");
  ids.nubank = await account("Nubank");
  await prisma.merchantRule.create({ data: { pattern: "padaria pao quente", categoryId: ids.mercado, source: "USER" } });
});

const tx = (description: string, amount: number, extra: Record<string, unknown> = {}) => {
  const date = (extra.date as Date | undefined) ?? daysAgo(5);
  // like the sync: chargeDate starts as the bank's date
  return prisma.transaction.create({
    data: { accountId: ids.btg!, date, chargeDate: date, description, amount, status: "REVIEW", ...extra },
  });
};

describe("post-sync pipeline", () => {
  it("categorizes with deterministic rules, user rules and Claude, pairs transfers and learns rules", async () => {
    claude({
      "Loja Nova XYZ": { category: "Mercado", confidence: 0.9 },
      "Coisa Estranha": { category: "Outros", confidence: 0.3 },
    });
    const invest = await tx("Aplicação RDB", -500);
    const pixOut = await tx("Pix", -300, { counterpartyType: "SELF", paymentMethod: "PIX" });
    const pixIn = await tx("Pix", 300, { accountId: ids.nubank, counterpartyType: "SELF", paymentMethod: "PIX" });
    const bakery = await tx("Padaria Pão Quente", -20);
    const shop = await tx("Loja Nova XYZ", -80);
    const unknown = await tx("Coisa Estranha", -10);

    const out = await runPostSyncJobs();

    const get = (id: string) => prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(await get(invest.id)).toMatchObject({ categoryId: ids.investimentos, status: "POSTED" });
    expect(await counts(invest.id)).toBe(false);
    expect(await get(pixOut.id)).toMatchObject({ categoryId: ids.transferencias, status: "POSTED" });
    const [a, b] = await Promise.all([get(pixOut.id), get(pixIn.id)]);
    expect(a.transferPairId).toBeTruthy();
    expect(b.transferPairId).toBe(a.transferPairId);
    expect(await get(bakery.id)).toMatchObject({ categoryId: ids.mercado, status: "POSTED" });
    expect(await get(shop.id)).toMatchObject({ categoryId: ids.mercado, status: "POSTED" });
    expect(await get(unknown.id)).toMatchObject({ categoryId: null, status: "REVIEW" });

    // Confident AI answers become rules; low-confidence ones don't.
    const rules = await prisma.merchantRule.findMany({ select: { pattern: true, source: true } });
    expect(rules).toContainEqual({ pattern: "loja nova xyz", source: "AI" });
    expect(rules.map((r) => r.pattern)).not.toContain("coisa estranha");

    expect(out).toMatchObject({ fromRules: 1, fromAI: 1, pendingReview: 1, aiError: null });
  });

  it("links new charges and switches a monthly plan that became yearly", async () => {
    claude({});
    const netflix = await prisma.recurring.create({
      data: { name: "Netflix", amount: -39.9, cadence: "MONTHLY", nextDate: daysAgo(-20), pattern: "netflix" },
    });
    const proton = await prisma.recurring.create({
      data: { name: "Proton", amount: -29, cadence: "MONTHLY", nextDate: daysAgo(-5), pattern: "proton ag" },
    });
    for (const d of [70, 40, 10]) await tx("Netflix", -39.9, { date: daysAgo(d), status: "POSTED", categoryId: ids.tecnologia });
    for (const d of [440, 410, 380]) {
      await tx("Proton AG", -29, { date: daysAgo(d), status: "POSTED", categoryId: ids.tecnologia, recurringId: proton.id });
    }
    await tx("Proton AG", -199, { date: daysAgo(15), status: "POSTED", categoryId: ids.tecnologia });

    const out = await runPostSyncJobs();

    expect(await prisma.transaction.count({ where: { recurringId: netflix.id } })).toBe(3);
    const p = await prisma.recurring.findUniqueOrThrow({ where: { id: proton.id } });
    expect(p).toMatchObject({ cadence: "YEARLY", amount: -199 });
    expect(JSON.parse(p.autoChange!)).toMatchObject({ reason: "cadence", from: { cadence: "MONTHLY" }, to: { cadence: "YEARLY" } });
    expect(out.recurringsChanged).toBe(1);
  });

  it("removes date-only copies of card payments the connector sends twice", async () => {
    claude({});
    const at = (h: number, m: number) => {
      const d = daysAgo(3);
      d.setHours(h, m, 0, 0);
      return d;
    };
    const copy = await tx("Pagamento recebido", 2383.73, { date: at(0, 0), status: "POSTED" });
    const real = await tx("Pagamento recebido", 2383.73, { date: at(20, 33), status: "POSTED" });
    const rides = [await tx("Uber", -12.9, { date: at(8, 44), status: "POSTED" }), await tx("Uber", -12.9, { date: at(20, 8), status: "POSTED" })];

    const out = await runPostSyncJobs();

    const left = new Set((await prisma.transaction.findMany({ select: { id: true } })).map((t) => t.id));
    expect(left.has(copy.id)).toBe(false);
    expect([real, ...rides].every((t) => left.has(t.id))).toBe(true);
    expect(out.duplicatesRemoved).toBe(1);
  });

  it("reads installments dated with the purchase day as charged in their month, keeping the bank's date", async () => {
    claude({});
    const purchase = daysAgo(200);
    const later = new Date(purchase.getTime() + 86_400_000);
    const first = await tx("Loja 1/3", -100, { date: purchase, installmentNumber: 1, totalInstallments: 3, purchaseDate: purchase, status: "POSTED" });
    const third = await tx("Loja 3/3", -100, { date: later, installmentNumber: 3, totalInstallments: 3, purchaseDate: purchase, status: "POSTED" });

    const out = await runPostSyncJobs();

    const [a, b] = await Promise.all([first, third].map((t) => prisma.transaction.findUniqueOrThrow({ where: { id: t.id } })));
    expect(a.chargeDate).toEqual(purchase);
    const expected = new Date(purchase);
    expected.setMonth(expected.getMonth() + 2);
    expect(b.chargeDate).toEqual(expected);
    expect(b.date).toEqual(later); // the bank's date is untouched
    expect(out.chargeDatesUpdated).toBe(1);
  });

  it("learns a pass-through: next month's bill and the money that funds it stop counting", async () => {
    claude({});
    const at = (daysBack: number) => daysAgo(daysBack);
    // the owner marked August's pair: a boleto someone else sends the money for
    await tx("Bankslip", -2279, { date: at(62), status: "POSTED", excludeOverride: true });
    await tx("Pix", 2279, { date: at(64), status: "POSTED", excludeOverride: true });
    // September's pair arrived with the sync, still counting
    const boleto = await tx("Bankslip", -2279, { date: at(32), status: "POSTED" });
    const pix = await tx("Pix", 2280, { date: at(33), status: "POSTED" });
    const grocery = await tx("Mercado Dia", -2279, { date: at(31), status: "POSTED" });

    const out = await runPostSyncJobs();

    const get = (id: string) => prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(await get(boleto.id)).toMatchObject({ excludeOverride: true });
    expect(await get(pix.id)).toMatchObject({ excludeOverride: true });
    expect(await counts(boleto.id)).toBe(false);
    expect(await counts(pix.id)).toBe(false);
    // same amount, but a real purchase on another day: untouched
    expect(await get(grocery.id)).toMatchObject({ excludeOverride: null });
    expect(await counts(grocery.id)).toBe(true);
    expect(out.passThroughs).toBe(2);
  });

  it("keeps the owner's pass-through mark when a rule categorizes the transaction", async () => {
    claude({});
    const marked = await tx("Padaria Pão Quente", -20, { excludeOverride: true });

    await runPostSyncJobs();

    // the user rule assigns Mercado (which counts), but the owner's mark wins
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: marked.id } })).toMatchObject({ categoryId: ids.mercado });
    expect(await counts(marked.id)).toBe(false);
  });

  it("counts a transaction again when the owner picks a category by hand", async () => {
    const { setTransactionCategory } = await import("@/app/actions/transactions");
    const salario = await prisma.category.create({ data: { name: "Salário", isIncome: true } });
    // the pipeline read this salary Pix as a transfer, so it stopped counting
    const pix = await tx("Pix Nossa Empresa", 583.67, { status: "POSTED", categoryId: ids.transferencias });
    // another one the owner marked as money that only passes through
    const marked = await tx("Pix Nossa Empresa", 583.67, {
      date: daysAgo(35),
      status: "POSTED",
      categoryId: ids.transferencias,
      excludeOverride: true,
    });

    await setTransactionCategory(pix.id, salario.id);

    const get = (id: string) => prisma.transaction.findUniqueOrThrow({ where: { id } });
    // corrected to Salário, so it counts as income again
    expect(await get(pix.id)).toMatchObject({ categoryId: salario.id });
    expect(await counts(pix.id)).toBe(true);
    // same merchant, same new category — but the owner's mark still wins
    expect(await get(marked.id)).toMatchObject({ categoryId: salario.id });
    expect(await counts(marked.id)).toBe(false);
  });

  it("keeps a paired transfer out of the budget when its category changes", async () => {
    const { setTransactionCategory } = await import("@/app/actions/transactions");
    const paired = await tx("Pix Entre Contas", 300, {
      status: "POSTED",
      categoryId: ids.transferencias,
      transferPairId: "pair_x",
    });

    await setTransactionCategory(paired.id, ids.outros!);

    // the pairing owns the exclusion and is undone by "desfazer o pareamento", not by the category
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: paired.id } })).toMatchObject({ categoryId: ids.outros });
    expect(await counts(paired.id)).toBe(false);
  });

  it("keeps the good suggestions when Claude answers a category that doesn't exist", async () => {
    claude({
      "Loja Nova XYZ": { category: "Mercado", confidence: 0.9 },
      "Coisa Estranha": { category: "Categoria Inventada", confidence: 0.95 },
    });
    const shop = await tx("Loja Nova XYZ", -80);
    const unknown = await tx("Coisa Estranha", -10);

    const out = await runPostSyncJobs();

    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: shop.id } })).toMatchObject({ categoryId: ids.mercado });
    // the invalid one goes back to review instead of failing the whole batch
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: unknown.id } })).toMatchObject({ status: "REVIEW" });
    expect(out.aiError).toBeNull();
  });

  it("keeps rules working and reports the error when Claude fails", async () => {
    parse.mockRejectedValue(new Error("credit balance is too low"));
    const bakery = await tx("Padaria Pão Quente", -20);
    const shop = await tx("Loja Nova XYZ", -80);

    const out = await runPostSyncJobs();

    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: bakery.id } })).status).toBe("POSTED");
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe("REVIEW");
    expect(out.aiError).toContain("credit balance is too low");
  });

  it("skips a failing step, runs the ones after it, and does not blame the AI", async () => {
    claude({ "Loja Nova XYZ": { category: "Mercado", confidence: 0.9 } });
    const shop = await tx("Loja Nova XYZ", -80);

    passThrough.fail = true;
    const out = await runPostSyncJobs().finally(() => (passThrough.fail = false));

    expect(out.passThroughs).toBe(0);
    expect(out.categorized).toBe(1);
    expect(out.aiError).toBeNull();
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: shop.id } })).toMatchObject({ categoryId: ids.mercado });
  });

  it("leaves money from the owner's unconnected bank to the owner, not to the AI", async () => {
    claude({ Pix: { category: "Transferências", confidence: 0.95 } });
    const salary = await tx("Pix", 1792.52, { counterpartyType: "SELF", paymentMethod: "PIX" });
    const ownRule = await tx("Transferencia Caixa", 2548.25, { counterpartyType: "SELF" });
    const aiRule = await tx("Pix Cash In Externo", 1886.51, { counterpartyType: "SELF" });
    const salario = await prisma.category.create({ data: { name: "Salário", isIncome: true } });
    await prisma.merchantRule.create({ data: { pattern: merchantPattern(ownRule)!, categoryId: salario.id, source: "USER" } });
    await prisma.merchantRule.create({ data: { pattern: merchantPattern(aiRule)!, categoryId: ids.transferencias!, source: "AI" } });

    await runPostSyncJobs();

    const sent = parse.mock.calls.map(([req]) => (req as { messages: { content: string }[] }).messages[0]!.content).join("\n");
    expect(sent).not.toContain(salary.id);
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: salary.id } })).toMatchObject({ status: "REVIEW", categoryId: null });
    expect(await counts(salary.id)).toBe(true);
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: ownRule.id } })).toMatchObject({ categoryId: salario.id });
    expect(await prisma.transaction.findUniqueOrThrow({ where: { id: aiRule.id } })).toMatchObject({ status: "REVIEW", categoryId: null });
  });

  it("detects recurrings without an AI key, under the merchant's name", async () => {
    parse.mockClear();
    const charges = await Promise.all([65, 35, 5].map((d) => tx("Plano NuCel", -25, { date: daysAgo(d) })));

    ai.configured = false;
    const out = await runPostSyncJobs().finally(() => (ai.configured = true));

    expect(parse).not.toHaveBeenCalled();
    expect(out.recurringsDetected).toBe(1);
    const rec = await prisma.recurring.findFirstOrThrow();
    expect(rec).toMatchObject({ name: "Plano NuCel", amount: -25, cadence: "MONTHLY", detectedByAI: false });
    const linked = await prisma.transaction.count({ where: { id: { in: charges.map((c) => c.id) }, recurringId: rec.id } });
    expect(linked).toBe(3);
  });
});
