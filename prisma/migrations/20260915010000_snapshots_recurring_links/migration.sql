-- AlterTable
ALTER TABLE "PluggyItem" ADD COLUMN "lastError" TEXT;
ALTER TABLE "PluggyItem" ADD COLUMN "lastSyncedAt" DATETIME;

-- AlterTable
ALTER TABLE "Recurring" ADD COLUMN "lastDate" DATETIME;
ALTER TABLE "Recurring" ADD COLUMN "pattern" TEXT;

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "balance" REAL NOT NULL,
    CONSTRAINT "BalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
-- Goal.accountId becomes a real FK: clear any dangling references first
UPDATE "Goal" SET "accountId" = NULL WHERE "accountId" IS NOT NULL AND "accountId" NOT IN (SELECT "id" FROM "Account");

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "balance" REAL NOT NULL DEFAULT 0,
    "creditLimit" REAL,
    "availableCreditLimit" REAL,
    "balanceCloseDate" DATETIME,
    "balanceDueDate" DATETIME,
    "minimumPayment" REAL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "pluggyItemId" TEXT,
    "pluggyAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Account" ("availableCreditLimit", "balance", "balanceCloseDate", "balanceDueDate", "createdAt", "creditLimit", "currency", "hidden", "id", "institution", "minimumPayment", "name", "pluggyAccountId", "pluggyItemId", "type", "updatedAt") SELECT "availableCreditLimit", "balance", "balanceCloseDate", "balanceDueDate", "createdAt", "creditLimit", "currency", "hidden", "id", "institution", "minimumPayment", "name", "pluggyAccountId", "pluggyItemId", "type", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_pluggyAccountId_key" ON "Account"("pluggyAccountId");
CREATE TABLE "new_Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "targetAmount" REAL NOT NULL,
    "currentAmount" REAL NOT NULL DEFAULT 0,
    "deadline" DATETIME,
    "icon" TEXT,
    "color" TEXT,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Goal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Goal" ("accountId", "color", "createdAt", "currentAmount", "deadline", "icon", "id", "name", "targetAmount", "updatedAt") SELECT "accountId", "color", "createdAt", "currentAmount", "deadline", "icon", "id", "name", "targetAmount", "updatedAt" FROM "Goal";
DROP TABLE "Goal";
ALTER TABLE "new_Goal" RENAME TO "Goal";
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "description" TEXT NOT NULL,
    "merchantRaw" TEXT,
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringId" TEXT,
    "pluggyTxId" TEXT,
    "excludeFromBudget" BOOLEAN NOT NULL DEFAULT false,
    "transferPairId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "Recurring" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("accountId", "amount", "categoryId", "createdAt", "currency", "date", "description", "excludeFromBudget", "id", "isRecurring", "merchantRaw", "notes", "pluggyTxId", "recurringId", "status", "transferPairId", "updatedAt") SELECT "accountId", "amount", "categoryId", "createdAt", "currency", "date", "description", "excludeFromBudget", "id", "isRecurring", "merchantRaw", "notes", "pluggyTxId", "recurringId", "status", "transferPairId", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_pluggyTxId_key" ON "Transaction"("pluggyTxId");
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_date_excludeFromBudget_idx" ON "Transaction"("date", "excludeFromBudget");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");
CREATE INDEX "Transaction_recurringId_idx" ON "Transaction"("recurringId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BalanceSnapshot_date_idx" ON "BalanceSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceSnapshot_accountId_date_key" ON "BalanceSnapshot"("accountId", "date");
