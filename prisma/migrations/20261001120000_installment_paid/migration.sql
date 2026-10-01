-- O banco só sabe o que já cobrou. Quitar um parcelamento antes do fim é informação
-- que só o dono tem, e sem ela o app projeta cobranças que não vão acontecer.
CREATE TABLE "InstallmentPaid" (
    "planKey" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("planKey", "number")
);
