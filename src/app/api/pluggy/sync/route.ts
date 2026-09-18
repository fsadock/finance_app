import { PluggyConfigError, pluggyErrorMessage } from "@/lib/pluggy/client";
import { syncItem, runPostSyncJobs, markSyncFailed } from "@/lib/pluggy/sync";
import { prisma } from "@/lib/infra/db";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/infra/rate-limit";

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
      try {
        const result = await syncItem(itemId);
        const post = await runPostSyncJobs({ fullHistory: result.isNew });
        return NextResponse.json({ stats: { ...result.stats, ...post } });
      } catch (e) {
        await markSyncFailed(itemId, e);
        throw e;
      }
    }

    // No itemId → sync all known items
    const items = await prisma.pluggyItem.findMany();
    const results = [];
    for (const it of items) {
      try {
        const r = await syncItem(it.pluggyId);
        results.push({ itemId: it.pluggyId, ok: true, stats: r.stats });
      } catch (e) {
        await markSyncFailed(it.pluggyId, e);
        results.push({ itemId: it.pluggyId, ok: false, error: pluggyErrorMessage(e) });
      }
    }
    const post = await runPostSyncJobs();
    return NextResponse.json({ items: results, post });
  } catch (e) {
    const status = e instanceof PluggyConfigError ? 400 : 502;
    return NextResponse.json({ error: pluggyErrorMessage(e) }, { status });
  }
}
