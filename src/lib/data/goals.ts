import { prisma } from "@/lib/infra/db";
import { getGoalAccountOptions } from "@/lib/data/accounts";
import { ACCOUNT_GROUP_LABEL } from "@/lib/domain/goals";

/**
 * Goals with the accounts each one follows, plus the accounts a goal can be linked to.
 *
 * One read of the accounts serves both: a goal that follows a whole kind has to see an account created
 * after it — a new crypto wallet is another investment account, and the goal must count it by itself.
 */
export async function getGoalsWithAccounts() {
  const [goals, accounts] = await Promise.all([
    prisma.goal.findMany({ orderBy: [{ createdAt: "asc" }] }),
    getGoalAccountOptions(),
  ]);

  return {
    accounts,
    goals: goals.map((g) => {
      const followed = g.accountType
        ? accounts.filter((a) => a.type === g.accountType)
        : accounts.filter((a) => a.id === g.accountId);
      const source = g.accountType
        ? (ACCOUNT_GROUP_LABEL[g.accountType] ?? g.accountType)
        : (followed[0]?.name ?? null);
      return { ...g, accounts: g.accountType || g.accountId ? followed : null, source };
    }),
  };
}
