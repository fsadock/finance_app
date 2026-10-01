-- Uma sessão de um ano nunca volta a perguntar nada. Guardar quando a passkey foi
-- conferida pela última vez permite exigi-la de novo depois de um tempo parado,
-- sem derrubar a sessão.
--
-- O padrão é uma constante porque o SQLite recusa CURRENT_TIMESTAMP em ADD COLUMN;
-- as sessões que já existem herdam a data em que foram criadas, então a primeira
-- abertura depois desta migração pede a passkey uma vez.
ALTER TABLE "Session" ADD COLUMN "verifiedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
UPDATE "Session" SET "verifiedAt" = "createdAt";
