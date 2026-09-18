import { prisma } from "@/lib/infra/db";

/** Every category, by name — for pickers and filters. */
export function getCategoryOptions() {
  return prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true, group: true } });
}

/** Categories that count toward budgets (not transfers, investments or bill payments), by name. */
export function getBudgetCategories() {
  return prisma.category.findMany({ where: { excludeFromBudget: false }, orderBy: { name: "asc" } });
}
