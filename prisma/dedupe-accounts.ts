import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

/**
 * One-shot cleanup: merges legacy accounts (pluggyAccountId=null) into their
 * new counterparts (pluggyAccountId set, same pluggyItemId + name) by moving
 * Transactions and Investments, then deletes the legacy row.
 */
async function main() {
  const orphans = await prisma.account.findMany({
    where: { pluggyAccountId: null, pluggyItemId: { not: null } },
  });
  console.log(`Found ${orphans.length} legacy account(s) without pluggyAccountId.`);

  let merged = 0;
  let removed = 0;
  for (const orphan of orphans) {
    const target = await prisma.account.findFirst({
      where: {
        pluggyItemId: orphan.pluggyItemId,
        name: orphan.name,
        pluggyAccountId: { not: null },
        id: { not: orphan.id },
      },
    });
    if (!target) {
      console.log(`  · ${orphan.name} (${orphan.id}): no new counterpart, leaving as-is`);
      continue;
    }
    const txs = await prisma.transaction.updateMany({
      where: { accountId: orphan.id },
      data: { accountId: target.id },
    });
    const invs = await prisma.investment.updateMany({
      where: { accountId: orphan.id },
      data: { accountId: target.id },
    });
    const recs = await prisma.recurring.updateMany({
      where: { accountId: orphan.id },
      data: { accountId: target.id },
    });
    await prisma.account.delete({ where: { id: orphan.id } });
    console.log(
      `  · ${orphan.name}: merged ${txs.count} tx + ${invs.count} inv + ${recs.count} rec into ${target.id}, deleted ${orphan.id}`
    );
    merged += txs.count + invs.count + recs.count;
    removed++;
  }
  console.log(`Done. Removed ${removed} duplicate accounts; relinked ${merged} rows.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
