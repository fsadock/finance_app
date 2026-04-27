import { syncItem } from "@/lib/pluggy/sync";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const itemId: string | undefined = body.itemId;
    if (itemId) {
      const result = await syncItem(itemId);
      return NextResponse.json({ stats: result.stats });
    }
    // No itemId → sync all known items
    const items = await prisma.pluggyItem.findMany();
    const results = [];
    for (const it of items) {
      try {
        const r = await syncItem(it.pluggyId);
        results.push({ itemId: it.pluggyId, ok: true, stats: r.stats });
      } catch (e) {
        results.push({ itemId: it.pluggyId, ok: false, error: e instanceof Error ? e.message : "err" });
      }
    }
    return NextResponse.json({ items: results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
