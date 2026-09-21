import { getTransactionsForExport } from "@/lib/data/transactions";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { buildTransactionWhere, TX_FILTER_KEYS } from "@/lib/data/transaction-filters";
import { localDayKey } from "@/lib/domain/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Neutralize spreadsheet formulas in free text (descriptions come from banks/merchants)
  if (/^[=+\-@\t\r]/.test(str) && !/^-?\d+(\.\d+)?$/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const row = (...cols: (string | number | null | undefined)[]) => cols.map(escapeCsv).join(",");

export async function GET(req: Request) {
  if (!checkRateLimit("transactions-export", 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const where = buildTransactionWhere(Object.fromEntries(TX_FILTER_KEYS.map((k) => [k, searchParams.get(k)])));

  const txs = await getTransactionsForExport(where);

  const lines = [
    row(
      "Data", "Data da cobrança", "Descrição", "Valor (BRL)", "Categoria", "Grupo", "Conta", "Tipo conta", "Status",
      "Método", "Contraparte", "Tipo contraparte", "Comerciante", "CNPJ comerciante", "Parcela", "Notas", "Tags", "ID"
    ),
  ];
  for (const t of txs) {
    lines.push(
      row(
        localDayKey(t.date),
        localDayKey(t.chargeDate),
        t.description,
        t.amount.toFixed(2),
        t.category?.name,
        t.category?.group,
        t.account.name,
        t.account.type,
        t.status,
        t.paymentMethod,
        t.counterpartyName,
        t.counterpartyType,
        t.merchantName,
        t.merchantCnpj,
        t.totalInstallments ? `${t.installmentNumber ?? "?"}/${t.totalInstallments}` : null,
        t.notes,
        t.tags.map((tg) => tg.name).join("; "),
        t.id
      )
    );
  }

  // BOM so Excel opens UTF-8 accents correctly
  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transacoes-${localDayKey(new Date())}.csv"`,
    },
  });
}
