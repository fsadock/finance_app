import { syncItem, runPostSyncJobs } from "@/lib/pluggy/sync";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!checkRateLimit("pluggy-sync", 5, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const itemId: string | undefined = body.itemId;

    if (itemId) {
      const result = await syncItem(itemId);
      const post = await runPostSyncJobs();
      return NextResponse.json({ stats: { ...result.stats, ...post } });
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
    const post = await runPostSyncJobs();
    return NextResponse.json({ items: results, post });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
