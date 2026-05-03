import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { monthBounds } from "@/lib/format";
import { type Prisma } from "@/generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(...cols: (string | number | null | undefined)[]): string {
  return cols.map(escapeCsv).join(",");
}

export async function GET(req: Request) {
  if (!checkRateLimit("transactions-export", 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const where: Prisma.TransactionWhereInput = {};

  const status = searchParams.get("status");
  const cat = searchParams.get("cat");
  const q = searchParams.get("q");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const month = searchParams.get("month");

  if (status === "REVIEW" || status === "POSTED" || status === "PENDING") where.status = status;
  if (cat) where.categoryId = cat;
  if (q) where.description = { contains: q };
  if (month && !from && !to) {
    const [year, mon] = month.split("-").map(Number);
    if (year && mon) {
      const { start, end } = monthBounds(new Date(year, mon - 1, 1));
      where.date = { gte: start, lt: end };
    }
  } else {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    if (from || to) where.date = dateFilter;
  }

  const txs = await prisma.transaction.findMany({
    where,
    include: { account: true, category: true, tags: true },
    orderBy: { date: "desc" },
  });

  const lines: string[] = [
    row("Data", "Descrição", "Valor (BRL)", "Categoria", "Grupo", "Conta", "Tipo conta", "Status", "Tags", "ID"),
  ];

  for (const t of txs) {
    const dateStr = t.date.toISOString().slice(0, 10);
    const tags = t.tags.map((tg) => tg.name).join("; ");
    lines.push(
      row(
        dateStr,
        t.description,
        t.amount.toFixed(2),
        t.category?.name ?? "",
        t.category?.group ?? "",
        t.account.name,
        t.account.type,
        t.status,
        tags,
        t.id,
      )
    );
  }

  const csv = lines.join("\n");
  const filename = `transacoes-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
