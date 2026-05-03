import { getPluggy } from "@/lib/pluggy/client";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!checkRateLimit("pluggy-connect-token", 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { itemId } = await req.json().catch(() => ({}));
    const pluggy = getPluggy();
    const token = await pluggy.createConnectToken(itemId);
    return NextResponse.json(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
