-- Until now the category picker changed a transaction's category without moving `excludeFromBudget` with it.
-- A transaction first classified as a transfer and then corrected by hand (a salary Pix, for instance) kept the
-- flag and vanished from every report, with nothing on screen explaining it. Realign the flag with what decides
-- it: the owner's own mark, then the transfer pairing, then the category.
UPDATE "Transaction"
SET "excludeFromBudget" = CASE
  WHEN "excludeOverride" IS NOT NULL THEN "excludeOverride"
  WHEN "transferPairId" IS NOT NULL THEN 1
  ELSE COALESCE((SELECT c."excludeFromBudget" FROM "Category" c WHERE c."id" = "Transaction"."categoryId"), 0)
END;
