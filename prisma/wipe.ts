import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

async function main() {
  console.log("Wiping all data except categories…");
  await prisma.transaction.deleteMany();
  await prisma.merchantRule.deleteMany();
  await prisma.recurring.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.account.deleteMany();
  await prisma.pluggyItem.deleteMany();
  console.log("Done. Categories preserved as taxonomy for AI classification.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
