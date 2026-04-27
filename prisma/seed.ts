import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function daysAgo(d: number) {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x;
}

async function main() {
  console.log("Wiping…");
  await prisma.transaction.deleteMany();
  await prisma.recurring.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.account.deleteMany();
  await prisma.category.deleteMany();
  await prisma.pluggyItem.deleteMany();

  console.log("Seeding categories…");
  const catData = [
    { name: "Salário", group: "Income", color: "#22c55e", icon: "briefcase" },
    { name: "Rendimentos", group: "Income", color: "#10b981", icon: "trending-up" },
    { name: "Mercado", group: "Essentials", color: "#84cc16", icon: "shopping-cart" },
    { name: "Restaurantes", group: "Food", color: "#f97316", icon: "utensils" },
    { name: "Delivery", group: "Food", color: "#fb923c", icon: "bike" },
    { name: "Cafés", group: "Food", color: "#fbbf24", icon: "coffee" },
    { name: "Transporte", group: "Transport", color: "#06b6d4", icon: "car" },
    { name: "Combustível", group: "Transport", color: "#0891b2", icon: "fuel" },
    { name: "Apps de mobilidade", group: "Transport", color: "#0ea5e9", icon: "taxi" },
    { name: "Aluguel", group: "Housing", color: "#a855f7", icon: "home" },
    { name: "Contas de casa", group: "Housing", color: "#9333ea", icon: "lightbulb" },
    { name: "Internet & Telefone", group: "Housing", color: "#7c3aed", icon: "wifi" },
    { name: "Saúde", group: "Health", color: "#ef4444", icon: "heart" },
    { name: "Farmácia", group: "Health", color: "#dc2626", icon: "pill" },
    { name: "Academia", group: "Health", color: "#f43f5e", icon: "dumbbell" },
    { name: "Educação", group: "Education", color: "#3b82f6", icon: "book" },
    { name: "Lazer", group: "Lifestyle", color: "#ec4899", icon: "film" },
    { name: "Streaming", group: "Lifestyle", color: "#d946ef", icon: "tv" },
    { name: "Assinaturas", group: "Lifestyle", color: "#c026d3", icon: "repeat" },
    { name: "Vestuário", group: "Shopping", color: "#f59e0b", icon: "shirt" },
    { name: "Eletrônicos", group: "Shopping", color: "#eab308", icon: "smartphone" },
    { name: "Viagem", group: "Lifestyle", color: "#14b8a6", icon: "plane" },
    { name: "Investimentos", group: "Transfers", color: "#64748b", icon: "trending-up", excludeFromBudget: true },
    { name: "Transferências", group: "Transfers", color: "#94a3b8", icon: "arrow-right-left", excludeFromBudget: true },
    { name: "Outros", group: "Other", color: "#6b7280", icon: "more-horizontal" },
  ];
  const cats: Record<string, { id: string }> = {};
  for (const c of catData) {
    const created = await prisma.category.create({ data: c });
    cats[c.name] = { id: created.id };
  }

  console.log("Seeding accounts…");
  const accNubankCC = await prisma.account.create({
    data: { name: "Nubank Roxinho", type: "CREDIT_CARD", institution: "Nubank", balance: -2840.5, creditLimit: 8000 },
  });
  const accNubankConta = await prisma.account.create({
    data: { name: "Nubank Conta", type: "CHECKING", institution: "Nubank", balance: 4231.78 },
  });
  const accItau = await prisma.account.create({
    data: { name: "Itaú Conta Corrente", type: "CHECKING", institution: "Itaú", balance: 1287.4 },
  });
  const accInterCC = await prisma.account.create({
    data: { name: "Inter Black", type: "CREDIT_CARD", institution: "Inter", balance: -1120.3, creditLimit: 5000 },
  });
  const accPoupanca = await prisma.account.create({
    data: { name: "Poupança Itaú", type: "SAVINGS", institution: "Itaú", balance: 12500.0 },
  });
  const accXP = await prisma.account.create({
    data: { name: "XP Investimentos", type: "INVESTMENT", institution: "XP", balance: 47820.55 },
  });
  const accNuInvest = await prisma.account.create({
    data: { name: "NuInvest", type: "INVESTMENT", institution: "Nubank", balance: 8932.1 },
  });
  const ccAccounts = [accNubankCC, accInterCC];
  const debitAccounts = [accNubankConta, accItau];

  console.log("Seeding budgets…");
  const budgetMap: Record<string, number> = {
    Mercado: 1200,
    Restaurantes: 600,
    Delivery: 250,
    Cafés: 120,
    Transporte: 200,
    Combustível: 400,
    "Apps de mobilidade": 250,
    Aluguel: 2200,
    "Contas de casa": 350,
    "Internet & Telefone": 200,
    Saúde: 200,
    Farmácia: 120,
    Academia: 130,
    Educação: 250,
    Lazer: 400,
    Streaming: 100,
    Assinaturas: 80,
    Vestuário: 300,
    Eletrônicos: 200,
    Viagem: 500,
  };
  const currentMonth = new Date().toISOString().slice(0, 7);
  for (const [name, limit] of Object.entries(budgetMap)) {
    await prisma.budget.create({
      data: { categoryId: cats[name]!.id, monthlyLimit: limit, startMonth: currentMonth },
    });
  }

  console.log("Seeding recurrings…");
  const recurrings = [
    { name: "Aluguel", amount: -2200, cadence: "MONTHLY" as const, dayOfMonth: 5, account: accNubankConta, category: "Aluguel" },
    { name: "Netflix", amount: -55.9, cadence: "MONTHLY" as const, dayOfMonth: 15, account: accNubankCC, category: "Streaming" },
    { name: "Spotify Família", amount: -34.9, cadence: "MONTHLY" as const, dayOfMonth: 10, account: accNubankCC, category: "Streaming" },
    { name: "Disney+", amount: -33.9, cadence: "MONTHLY" as const, dayOfMonth: 20, account: accNubankCC, category: "Streaming" },
    { name: "Smartfit", amount: -129.9, cadence: "MONTHLY" as const, dayOfMonth: 8, account: accNubankCC, category: "Academia" },
    { name: "iCloud 200GB", amount: -11.9, cadence: "MONTHLY" as const, dayOfMonth: 22, account: accNubankCC, category: "Assinaturas" },
    { name: "ChatGPT Plus", amount: -119, cadence: "MONTHLY" as const, dayOfMonth: 18, account: accInterCC, category: "Assinaturas" },
    { name: "Vivo Internet", amount: -109.9, cadence: "MONTHLY" as const, dayOfMonth: 12, account: accNubankConta, category: "Internet & Telefone" },
    { name: "Enel Energia", amount: -185.4, cadence: "MONTHLY" as const, dayOfMonth: 7, account: accNubankConta, category: "Contas de casa" },
    { name: "Sabesp", amount: -78.2, cadence: "MONTHLY" as const, dayOfMonth: 14, account: accNubankConta, category: "Contas de casa" },
    { name: "Salário Empresa", amount: 9800, cadence: "MONTHLY" as const, dayOfMonth: 5, account: accNubankConta, category: "Salário" },
  ];
  const recurringRecords = [];
  for (const r of recurrings) {
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth() + (today.getDate() > r.dayOfMonth ? 1 : 0), r.dayOfMonth);
    const rec = await prisma.recurring.create({
      data: {
        name: r.name,
        amount: r.amount,
        cadence: r.cadence,
        nextDate: next,
        accountId: r.account.id,
        categoryId: cats[r.category]!.id,
        confidence: 0.98,
        detectedByAI: false,
      },
    });
    recurringRecords.push({ rec, ...r });
  }

  console.log("Seeding 6 months of recurring transactions…");
  for (const { rec, dayOfMonth, amount, account, category, name } of recurringRecords) {
    for (let m = 0; m < 6; m++) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      d.setDate(dayOfMonth);
      if (d > new Date()) continue;
      await prisma.transaction.create({
        data: {
          accountId: account.id,
          date: d,
          amount,
          description: name,
          merchantRaw: name.toUpperCase(),
          categoryId: cats[category]!.id,
          status: "POSTED",
          isRecurring: true,
          recurringId: rec.id,
        },
      });
    }
  }

  console.log("Seeding random transactions…");
  const merchants = [
    { name: "Pão de Açúcar", cat: "Mercado", min: 80, max: 450 },
    { name: "Carrefour", cat: "Mercado", min: 60, max: 380 },
    { name: "Hortifruti", cat: "Mercado", min: 30, max: 120 },
    { name: "iFood", cat: "Delivery", min: 25, max: 95 },
    { name: "Rappi", cat: "Delivery", min: 30, max: 80 },
    { name: "Outback", cat: "Restaurantes", min: 90, max: 280 },
    { name: "Madero", cat: "Restaurantes", min: 60, max: 180 },
    { name: "Coco Bambu", cat: "Restaurantes", min: 120, max: 350 },
    { name: "Starbucks", cat: "Cafés", min: 18, max: 45 },
    { name: "Padaria do Bairro", cat: "Cafés", min: 8, max: 25 },
    { name: "Uber", cat: "Apps de mobilidade", min: 12, max: 65 },
    { name: "99", cat: "Apps de mobilidade", min: 10, max: 55 },
    { name: "Posto Shell", cat: "Combustível", min: 80, max: 300 },
    { name: "Posto Ipiranga", cat: "Combustível", min: 70, max: 280 },
    { name: "Drogasil", cat: "Farmácia", min: 25, max: 180 },
    { name: "Drogaria São Paulo", cat: "Farmácia", min: 20, max: 150 },
    { name: "Amazon", cat: "Eletrônicos", min: 50, max: 800 },
    { name: "Mercado Livre", cat: "Eletrônicos", min: 30, max: 600 },
    { name: "Renner", cat: "Vestuário", min: 80, max: 400 },
    { name: "Zara", cat: "Vestuário", min: 150, max: 600 },
    { name: "Cinemark", cat: "Lazer", min: 35, max: 120 },
    { name: "Steam", cat: "Lazer", min: 20, max: 200 },
    { name: "Udemy", cat: "Educação", min: 25, max: 90 },
    { name: "Decolar", cat: "Viagem", min: 200, max: 1500 },
  ];
  const incomeMerchants = [
    { name: "PIX recebido - João", cat: "Outros", min: 50, max: 300 },
    { name: "Reembolso", cat: "Outros", min: 30, max: 200 },
    { name: "Rendimento poupança", cat: "Rendimentos", min: 20, max: 80 },
  ];

  // 6 months of randomized spending
  const txCount = 380;
  for (let i = 0; i < txCount; i++) {
    const m = pick(merchants);
    const acct = Math.random() < 0.65 ? pick(ccAccounts) : pick(debitAccounts);
    const date = daysAgo(Math.floor(rand(0, 180)));
    const amount = -Number(rand(m.min, m.max).toFixed(2));
    const recent = date >= daysAgo(7);
    await prisma.transaction.create({
      data: {
        accountId: acct.id,
        date,
        amount,
        description: m.name,
        merchantRaw: m.name.toUpperCase(),
        categoryId: recent && Math.random() < 0.35 ? null : cats[m.cat]!.id,
        status: recent && Math.random() < 0.35 ? "REVIEW" : "POSTED",
      },
    });
  }
  for (let i = 0; i < 20; i++) {
    const m = pick(incomeMerchants);
    const acct = pick(debitAccounts);
    const date = daysAgo(Math.floor(rand(0, 180)));
    const amount = Number(rand(m.min, m.max).toFixed(2));
    await prisma.transaction.create({
      data: {
        accountId: acct.id,
        date,
        amount,
        description: m.name,
        merchantRaw: m.name.toUpperCase(),
        categoryId: cats[m.cat]!.id,
        status: "POSTED",
      },
    });
  }

  console.log("Seeding goals…");
  await prisma.goal.createMany({
    data: [
      { name: "Reserva de emergência", targetAmount: 30000, currentAmount: 12500, color: "#22c55e", icon: "shield" },
      { name: "Viagem Europa", targetAmount: 18000, currentAmount: 6200, deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 240), color: "#06b6d4", icon: "plane" },
      { name: "Notebook novo", targetAmount: 9000, currentAmount: 4100, deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90), color: "#f97316", icon: "laptop" },
      { name: "Casa própria - entrada", targetAmount: 80000, currentAmount: 21300, color: "#a855f7", icon: "home" },
    ],
  });

  console.log("Seeding investments…");
  await prisma.investment.createMany({
    data: [
      { accountId: accXP.id, name: "Petrobras", ticker: "PETR4", type: "STOCK", quantity: 200, currentPrice: 38.45, costBasis: 32.1 },
      { accountId: accXP.id, name: "Vale", ticker: "VALE3", type: "STOCK", quantity: 80, currentPrice: 62.3, costBasis: 70.0 },
      { accountId: accXP.id, name: "Itaúsa", ticker: "ITSA4", type: "STOCK", quantity: 500, currentPrice: 10.85, costBasis: 9.2 },
      { accountId: accXP.id, name: "iShares Bovespa", ticker: "BOVA11", type: "ETF", quantity: 60, currentPrice: 122.4, costBasis: 110.5 },
      { accountId: accXP.id, name: "Tesouro Selic 2029", type: "FIXED_INCOME", quantity: 1, currentPrice: 14820.55, costBasis: 13500 },
      { accountId: accNuInvest.id, name: "CDB Nubank 110% CDI", type: "FIXED_INCOME", quantity: 1, currentPrice: 5432.1, costBasis: 5000 },
      { accountId: accNuInvest.id, name: "Bitcoin", ticker: "BTC", type: "CRYPTO", quantity: 0.012, currentPrice: 380000, costBasis: 290000 },
      { accountId: accXP.id, name: "Magalu", ticker: "MGLU3", type: "STOCK", quantity: 1000, currentPrice: 8.12, costBasis: 12.5 },
    ],
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
