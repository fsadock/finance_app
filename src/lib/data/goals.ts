import { prisma } from "@/lib/infra/db";
import { getGoalAccountOptions } from "@/lib/data/accounts";

/** Goals (oldest first) and the accounts a goal can be linked to. */
export async function getGoalsWithAccounts() {
  const [goals, accounts] = await Promise.all([
    prisma.goal.findMany({
      orderBy: [{ createdAt: "asc" }],
      include: { account: { select: { name: true, balance: true } } },
    }),
    getGoalAccountOptions(),
  ]);
  return { goals, accounts };
}
