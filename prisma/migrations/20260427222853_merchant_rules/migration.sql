-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.9,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MerchantRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_pattern_key" ON "MerchantRule"("pattern");

-- CreateIndex
CREATE INDEX "MerchantRule_pattern_idx" ON "MerchantRule"("pattern");
