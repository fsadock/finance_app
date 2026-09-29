-- CreateTable
CREATE TABLE "CryptoPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "totalBrl" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "CryptoPurchase_symbol_date_idx" ON "CryptoPurchase"("symbol", "date");
