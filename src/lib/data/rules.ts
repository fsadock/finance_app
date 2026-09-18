import { prisma } from "@/lib/infra/db";

/** Merchant rules (most used first, up to 500), optionally filtered, plus how many exist per source. */
export async function getRules({ q, source }: { q?: string; source?: "AI" | "USER" }) {
  const [rules, counts] = await Promise.all([
    prisma.merchantRule.findMany({
      where: { ...(q ? { pattern: { contains: q } } : {}), ...(source ? { source } : {}) },
      include: { category: { select: { name: true, color: true } } },
      orderBy: [{ hits: "desc" }, { pattern: "asc" }],
      take: 500,
    }),
    prisma.merchantRule.groupBy({ by: ["source"], _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.source === s)?._count ?? 0;
  return { rules, count };
}
