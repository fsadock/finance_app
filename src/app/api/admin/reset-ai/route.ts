import { resetAiClassifications } from "@/app/actions/transactions";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  // Reset-AI is expensive (calls Claude in a loop) — max 2 per hour
  if (!checkRateLimit("admin-reset-ai", 2, 3_600_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const result = await resetAiClassifications();
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
