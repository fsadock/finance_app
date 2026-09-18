import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/infra/rate-limit";
import { applyDeterministicRules } from "@/lib/jobs/deterministic";
import { categorizeAllPending } from "@/lib/ai/categorize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Categorizes every pending (REVIEW) transaction: deterministic rules → merchant rules → AI. Keeps existing rules. */
export async function POST() {
  if (!checkRateLimit("ai-categorize", 6, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const deterministic = await applyDeterministicRules();
  const result = await categorizeAllPending();
  revalidatePath("/", "layout");
  return NextResponse.json({ deterministic: deterministic.categorized, redated: deterministic.redated, ...result });
}
