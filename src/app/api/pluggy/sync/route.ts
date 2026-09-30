import { PluggyConfigError, pluggyErrorMessage } from "@/lib/pluggy/client";
import { syncItem, markSyncFailed, refreshItem } from "@/lib/pluggy/sync";
import { runPostSyncJobs } from "@/lib/jobs/pipeline";
import { syncEverything } from "@/lib/jobs/sync";
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
    // `collect` asks the institution for fresh data first; without it the app only re-imports the
    // snapshot Pluggy already had, which is at most a day old.
    const collect: boolean = body.collect === true;

    if (itemId) {
      try {
        const collected = collect ? await refreshItem(itemId) : null;
        const result = await syncItem(itemId);
        const post = await runPostSyncJobs({ fullHistory: result.isNew });
        return NextResponse.json({ stats: { ...result.stats, ...post }, collected });
      } catch (e) {
        await markSyncFailed(itemId, e);
        throw e;
      }
    }

    // No itemId → sync all known items
    return NextResponse.json(await syncEverything());
  } catch (e) {
    const status = e instanceof PluggyConfigError ? 400 : 502;
    return NextResponse.json({ error: pluggyErrorMessage(e) }, { status });
  }
}
