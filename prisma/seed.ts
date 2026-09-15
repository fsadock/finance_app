import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

type SeedCategory = { name: string; group: string; color: string; icon: string; excludeFromBudget?: boolean; irpfType?: string };

const CATEGORIES: SeedCategory[] = [
  // Income
  { name: "Salário", group: "Income", color: "#22c55e", icon: "briefcase" },
  { name: "Rendimentos", group: "Income", color: "#10b981", icon: "trending-up" },
  { name: "Reembolsos", group: "Income", color: "#34d399", icon: "rotate-ccw" },
  { name: "Doações recebidas", group: "Income", color: "#6ee7b7", icon: "gift" },
  // Food
  { name: "Mercado", group: "Essentials", color: "#84cc16", icon: "shopping-cart" },
  { name: "Restaurantes", group: "Food", color: "#f97316", icon: "utensils" },
  { name: "Delivery", group: "Food", color: "#fb923c", icon: "bike" },
  { name: "Cafés", group: "Food", color: "#fbbf24", icon: "coffee" },
  // Transport
  { name: "Transporte", group: "Transport", color: "#06b6d4", icon: "car" },
  { name: "Combustível", group: "Transport", color: "#0891b2", icon: "fuel" },
  { name: "Apps de mobilidade", group: "Transport", color: "#0ea5e9", icon: "taxi" },
  { name: "Estacionamento & Pedágio", group: "Transport", color: "#0284c7", icon: "parking-circle" },
  // Housing
  { name: "Aluguel", group: "Housing", color: "#a855f7", icon: "home" },
  { name: "Contas de casa", group: "Housing", color: "#9333ea", icon: "lightbulb" },
  { name: "Internet & Telefone", group: "Housing", color: "#7c3aed", icon: "wifi" },
  { name: "Casa & Decoração", group: "Housing", color: "#8b5cf6", icon: "sofa" },
  // Health
  { name: "Saúde", group: "Health", color: "#ef4444", icon: "heart", irpfType: "MEDICAL" },
  { name: "Farmácia", group: "Health", color: "#dc2626", icon: "pill" },
  { name: "Academia", group: "Health", color: "#f43f5e", icon: "dumbbell" },
  { name: "Cuidados pessoais", group: "Health", color: "#fb7185", icon: "scissors" },
  // Education
  { name: "Educação", group: "Education", color: "#3b82f6", icon: "book", irpfType: "EDUCATION" },
  // Lifestyle / Shopping
  { name: "Lazer", group: "Lifestyle", color: "#ec4899", icon: "film" },
  { name: "Streaming", group: "Lifestyle", color: "#d946ef", icon: "tv" },
  { name: "Assinaturas", group: "Lifestyle", color: "#c026d3", icon: "repeat" },
  { name: "Vestuário", group: "Shopping", color: "#f59e0b", icon: "shirt" },
  { name: "Eletrônicos", group: "Shopping", color: "#eab308", icon: "smartphone" },
  { name: "Tecnologia & Software", group: "Shopping", color: "#facc15", icon: "code" },
  { name: "Presentes", group: "Lifestyle", color: "#f472b6", icon: "gift" },
  { name: "Viagem", group: "Lifestyle", color: "#14b8a6", icon: "plane" },
  { name: "Pets", group: "Lifestyle", color: "#fcd34d", icon: "paw-print" },
  // Obligations
  { name: "Impostos & Taxas", group: "Obligations", color: "#78716c", icon: "landmark" },
  { name: "Seguros", group: "Obligations", color: "#a8a29e", icon: "shield" },
  { name: "Tarifas & Juros", group: "Obligations", color: "#b45309", icon: "percent" },
  { name: "Pagamentos a pessoas", group: "Other", color: "#a3a3a3", icon: "user" },
  { name: "Doações", group: "Lifestyle", color: "#fda4af", icon: "hand-heart" },
  // Transfers (excluded from budget)
  { name: "Investimentos", group: "Transfers", color: "#64748b", icon: "trending-up", excludeFromBudget: true },
  { name: "Previdência privada", group: "Transfers", color: "#475569", icon: "shield-check", excludeFromBudget: true, irpfType: "PENSION" },
  { name: "Transferências", group: "Transfers", color: "#94a3b8", icon: "arrow-right-left", excludeFromBudget: true },
  { name: "Pagamento de fatura", group: "Transfers", color: "#cbd5e1", icon: "credit-card", excludeFromBudget: true },
  { name: "Outros", group: "Other", color: "#6b7280", icon: "more-horizontal" },
];

async function main() {
  console.log("Seeding categories…");
  for (const c of CATEGORIES) {
    const data = {
      group: c.group,
      color: c.color,
      icon: c.icon,
      excludeFromBudget: c.excludeFromBudget ?? false,
      isIncome: c.group === "Income",
      irpfType: c.irpfType ?? null,
    };
    await prisma.category.upsert({ where: { name: c.name }, create: { name: c.name, ...data }, update: data });
  }
  console.log(`Done. ${CATEGORIES.length} categories ensured.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
