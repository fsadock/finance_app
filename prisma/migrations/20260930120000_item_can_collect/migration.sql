-- Nem toda instituição aceita uma coleta sob demanda: as que chegam pelo portal de
-- compartilhamento do Open Finance só atualizam no ciclo diário. Guardar a resposta da
-- primeira tentativa evita oferecer um botão que não pode funcionar.
ALTER TABLE "PluggyItem" ADD COLUMN "canCollect" BOOLEAN;
