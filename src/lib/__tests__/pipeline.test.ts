// Runs the post-sync pipeline (deterministic rules → transfers → categorize → recurrings) on a real,
// migrated SQLite database, with Claude mocked.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "financas-pipeline-"));
const DATABASE_URL = `file:${path.join(dir, "test.db")}`;
process.env.DATABASE_URL = DATABASE_URL;

const parse = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  getAnthropicOrNull: async () => ({}),
  getAnthropic: async () => ({ messages: { parse } }),
  MODEL_FAST: "test-model",
  aiErrorMessage: (e: unknown) => `IA indisponível: ${e instanceof Error ? e.message : String(e)}`,
}));

type Db = typeof import("@/lib/infra/db")["prisma"];
let prisma: Db;
let runPostSyncJobs: typeof import("@/lib/jobs/pipeline")["runPostSyncJobs"];

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

const tx = (description: string, amount: number, extra: Record<string, unknown> = {}) =>
  prisma.transaction.create({
    data: { accountId: ids.btg!, date: daysAgo(5), description, amount, status: "REVIEW", ...extra },
  });

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
    expect(await get(invest.id)).toMatchObject({ categoryId: ids.investimentos, status: "POSTED", excludeFromBudget: true });
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

  it("keeps rules working and reports the error when Claude fails", async () => {
    parse.mockRejectedValue(new Error("credit balance is too low"));
    const bakery = await tx("Padaria Pão Quente", -20);
    const shop = await tx("Loja Nova XYZ", -80);

    const out = await runPostSyncJobs();

    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: bakery.id } })).status).toBe("POSTED");
    expect((await prisma.transaction.findUniqueOrThrow({ where: { id: shop.id } })).status).toBe("REVIEW");
    expect(out.aiError).toContain("credit balance is too low");
  });
});
