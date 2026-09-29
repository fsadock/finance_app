import { NextResponse } from "next/server";
import { getQuotes, getUsdBrl } from "@/lib/market/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live prices for the screen to poll. The sources are cached in lib/market, so polling stays cheap. */
export async function GET() {
  const [quotes, dollar] = await Promise.all([getQuotes(), getUsdBrl()]);
  return NextResponse.json({ quotes, dollar, at: new Date().toISOString() });
}
