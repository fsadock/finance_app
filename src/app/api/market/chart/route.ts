import { NextResponse, type NextRequest } from "next/server";
import { CHART_RANGES, CHART_SYMBOLS, getCandles, type ChartRange, type ChartSymbol } from "@/lib/market/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isSymbol = (v: string | null): v is ChartSymbol => CHART_SYMBOLS.includes(v as ChartSymbol);
const isRange = (v: string | null): v is ChartRange => CHART_RANGES.includes(v as ChartRange);

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const range = request.nextUrl.searchParams.get("range");
  if (!isSymbol(symbol) || !isRange(range)) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }
  return NextResponse.json({ candles: await getCandles(symbol, range) });
}
