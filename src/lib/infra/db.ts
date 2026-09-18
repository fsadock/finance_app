import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// Dev HMR keeps globalThis alive, so the client is cached there to avoid opening a new
// connection per reload. The generated PrismaClient class is cached alongside it: after
// `prisma generate` (new columns/models) the class identity changes and a fresh client is
// created — otherwise the old one keeps validating queries against the previous schema.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClass?: typeof PrismaClient;
};

function createClient() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const file = url.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url: file });
  return new PrismaClient({ adapter });
}

const cached = globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined;
if (!cached && globalForPrisma.prisma) void globalForPrisma.prisma.$disconnect().catch(() => {});

export const prisma = cached ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClass = PrismaClient;
}
