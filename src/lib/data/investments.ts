import { prisma } from "@/lib/infra/db";

/** Investments held in visible accounts. */
export function getInvestments() {
  return prisma.investment.findMany({ include: { account: true }, where: { account: { hidden: false } } });
}
