-- AlterTable
ALTER TABLE "PluggyItem" ADD COLUMN "consentExpiresAt" DATETIME;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "counterpartyName" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "counterpartyType" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "installmentNumber" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "mcc" INTEGER;
ALTER TABLE "Transaction" ADD COLUMN "merchantCnae" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "merchantCnpj" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "merchantName" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "pluggyBillId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "pluggyCategory" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "purchaseAmount" REAL;
ALTER TABLE "Transaction" ADD COLUMN "purchaseDate" DATETIME;
ALTER TABLE "Transaction" ADD COLUMN "totalInstallments" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "parentId" TEXT,
    "group" TEXT,
    "excludeFromBudget" BOOLEAN NOT NULL DEFAULT false,
    "rolloverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isIncome" BOOLEAN NOT NULL DEFAULT false,
    "irpfType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("color", "createdAt", "excludeFromBudget", "group", "icon", "id", "name", "parentId", "rolloverEnabled") SELECT "color", "createdAt", "excludeFromBudget", "group", "icon", "id", "name", "parentId", "rolloverEnabled" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Transaction_totalInstallments_idx" ON "Transaction"("totalInstallments");

-- Backfill: existing income categories and IRPF-deductible defaults
UPDATE "Category" SET "isIncome" = true WHERE "group" = 'Income';
UPDATE "Category" SET "irpfType" = 'MEDICAL' WHERE "name" = 'Saúde';
UPDATE "Category" SET "irpfType" = 'EDUCATION' WHERE "name" = 'Educação';
