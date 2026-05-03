-- Add standalone date index and composite date+excludeFromBudget index
-- to Transaction table. Most queries filter by date range, and many also
-- filter by excludeFromBudget simultaneously.
CREATE INDEX IF NOT EXISTS "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX IF NOT EXISTS "Transaction_date_excludeFromBudget_idx" ON "Transaction"("date", "excludeFromBudget");
