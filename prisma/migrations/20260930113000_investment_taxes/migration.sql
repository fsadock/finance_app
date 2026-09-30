-- Renda fixa chega do Open Finance já líquida de imposto: guardar o que foi retido
-- é o que permite mostrar o mesmo valor que o app do banco mostra.
ALTER TABLE "Investment" ADD COLUMN "incomeTax" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Investment" ADD COLUMN "iof" REAL NOT NULL DEFAULT 0;
