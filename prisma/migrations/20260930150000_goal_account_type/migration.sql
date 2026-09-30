-- Uma meta de "investimentos" não é uma conta: é todo o dinheiro investido, e ele mora em
-- várias contas (a corretora, e uma por carteira de cripto). Seguir só uma deixava de fora
-- tudo que fosse criado depois.
ALTER TABLE "Goal" ADD COLUMN "accountType" TEXT;
