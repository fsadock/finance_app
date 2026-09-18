import { prisma } from "@/lib/infra/db";
import { INCOME_WHERE } from "@/lib/domain/flows";

/** Income and IRPF-deductible transactions of a calendar year. */
export async function getTaxYear(year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  const range = { date: { gte: start, lt: end } };

  const [incomeTx, deductibleTx] = await Promise.all([
    prisma.transaction.findMany({
      where: { AND: [range, INCOME_WHERE] },
      select: { amount: true, date: true, category: { select: { name: true } } },
    }),
    prisma.transaction.findMany({
      where: { ...range, category: { irpfType: { not: null } } },
      select: {
        id: true,
        date: true,
        amount: true,
        description: true,
        merchantName: true,
        merchantCnpj: true,
        counterpartyName: true,
        counterpartyType: true,
        category: { select: { name: true, irpfType: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);
  return { incomeTx, deductibleTx };
}
