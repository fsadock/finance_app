-- chargeDate starts equal to date; the post-sync job adjusts installments dated with the purchase day.
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "chargeDate" DATETIME NOT NULL,
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
    "paymentMethod" TEXT,
    "counterpartyName" TEXT,
    "counterpartyType" TEXT,
    "merchantName" TEXT,
    "merchantCnpj" TEXT,
    "merchantCnae" TEXT,
    "mcc" INTEGER,
    "installmentNumber" INTEGER,
    "totalInstallments" INTEGER,
    "purchaseAmount" REAL,
    "purchaseDate" DATETIME,
    "pluggyBillId" TEXT,
    "pluggyCategory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "Recurring" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("chargeDate", "accountId", "amount", "categoryId", "counterpartyName", "counterpartyType", "createdAt", "currency", "date", "description", "excludeFromBudget", "id", "installmentNumber", "isRecurring", "mcc", "merchantCnae", "merchantCnpj", "merchantName", "merchantRaw", "notes", "paymentMethod", "pluggyBillId", "pluggyCategory", "pluggyTxId", "purchaseAmount", "purchaseDate", "recurringId", "status", "totalInstallments", "transferPairId", "updatedAt") SELECT "date", "accountId", "amount", "categoryId", "counterpartyName", "counterpartyType", "createdAt", "currency", "date", "description", "excludeFromBudget", "id", "installmentNumber", "isRecurring", "mcc", "merchantCnae", "merchantCnpj", "merchantName", "merchantRaw", "notes", "paymentMethod", "pluggyBillId", "pluggyCategory", "pluggyTxId", "purchaseAmount", "purchaseDate", "recurringId", "status", "totalInstallments", "transferPairId", "updatedAt" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_pluggyTxId_key" ON "Transaction"("pluggyTxId");
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_date_excludeFromBudget_idx" ON "Transaction"("date", "excludeFromBudget");
CREATE INDEX "Transaction_accountId_chargeDate_idx" ON "Transaction"("accountId", "chargeDate");
CREATE INDEX "Transaction_chargeDate_excludeFromBudget_idx" ON "Transaction"("chargeDate", "excludeFromBudget");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_transferPairId_idx" ON "Transaction"("transferPairId");
CREATE INDEX "Transaction_recurringId_idx" ON "Transaction"("recurringId");
CREATE INDEX "Transaction_totalInstallments_idx" ON "Transaction"("totalInstallments");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
