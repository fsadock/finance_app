-- A coluna guardava se a instituição aceita coleta sob demanda, para o botão "Buscar no banco".
-- O único conector disponível recusa a coleta, então o botão saiu e a coluna não tem mais leitor.
ALTER TABLE "PluggyItem" DROP COLUMN "canCollect";
