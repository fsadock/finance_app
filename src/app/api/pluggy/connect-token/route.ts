import { getPluggy } from "@/lib/pluggy/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
