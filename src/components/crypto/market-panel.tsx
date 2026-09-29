"use client";

import { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_AXIS_PROPS, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from "@/components/ui/chart-theme";
import { formatBRL, formatBRLCompact, formatUSD } from "@/lib/domain/format";
import { cn } from "@/lib/utils";
import { readJson } from "@/lib/client/api";
import type { Candle, DollarRate, Quote } from "@/lib/market/prices";

type Market = { quotes: Quote[]; dollar: DollarRate | null };

const RANGES = [
  { key: "1d", label: "24h" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "1y", label: "1 ano" },
] as const;

const ASSETS = [
  { key: "BTC", name: "Bitcoin", color: "#f7931a" },
  { key: "SOL", name: "Solana", color: "#9945ff" },
  { key: "USDBRL", name: "Dólar", color: "var(--color-accent)" },
] as const;

type AssetKey = (typeof ASSETS)[number]["key"];

/** Refreshed this often while the page is open; the server caches the sources, so this stays cheap. */
const POLL_MS = 30_000;

function Change({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={cn("text-xs font-medium tabular-nums", up ? "text-accent" : "text-danger")}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(2).replace(".", ",")}%
    </span>
  );
}

/**
 * Live prices for what the owner holds (BTC, SOL) and for the dollar, each in reais and dollars, with the
 * chart of whichever one is selected. Prices come from Binance's BRL pairs and the commercial dollar.
 */
export function MarketPanel({ initial }: { initial: Market }) {
  const [market, setMarket] = useState(initial);
  const [asset, setAsset] = useState<AssetKey>("BTC");
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("7d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);

  const quote = (symbol: string) => market.quotes.find((q) => q.symbol === symbol);
  const selected = ASSETS.find((a) => a.key === asset)!;

  useEffect(() => {
    const tick = async () => {
      try {
        setMarket(await readJson(await fetch("/api/market")));
        setStale(false);
      } catch {
        setStale(true);
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const loadCandles = useCallback(async () => {
    try {
      const data = await readJson(await fetch(`/api/market/chart?symbol=${asset}&range=${range}`));
      setCandles(data.candles ?? []);
    } catch {
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, [asset, range]);

  useEffect(() => {
    const first = setTimeout(() => void loadCandles(), 0);
    const poll = setInterval(() => void loadCandles(), POLL_MS * 2);
    return () => {
      clearTimeout(first);
      clearInterval(poll);
    };
  }, [loadCandles]);

  const first = candles[0]?.close;
  const last = candles[candles.length - 1]?.close;
  const rangeChange = first && last ? ((last - first) / first) * 100 : null;
  const dayFormat = new Intl.DateTimeFormat("pt-BR", range === "1d" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short" });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {ASSETS.map((a) => {
          const q = a.key === "USDBRL" ? null : quote(a.key);
          const brl = a.key === "USDBRL" ? market.dollar?.rate : q?.brl;
          const change = a.key === "USDBRL" ? market.dollar?.change24h : q?.change24h;
          const active = asset === a.key;
          return (
            <button
              key={a.key}
              onClick={() => {
                setLoading(true);
                setAsset(a.key);
              }}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                active ? "border-accent/60 bg-bg-hover" : "border-border bg-bg-card hover:bg-bg-hover"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="size-2 rounded-full" style={{ background: a.color }} />
                  {a.name}
                </span>
                {change !== undefined && change !== null && <Change value={change} />}
              </div>
              <div className="mt-2 text-xl font-semibold tabular-nums">{brl ? formatBRL(brl) : "—"}</div>
              {a.key !== "USDBRL" && q && <div className="text-xs text-fg-muted tabular-nums">{formatUSD(q.usd)}</div>}
              {a.key === "USDBRL" && <div className="text-xs text-fg-muted">comercial · venda</div>}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{selected.name}</h3>
            {rangeChange !== null && <Change value={rangeChange} />}
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
              <span className={cn("size-1.5 rounded-full", stale ? "bg-warn" : "animate-pulse bg-accent")} />
              {stale ? "sem conexão" : "ao vivo"}
            </span>
          </div>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => {
                  setLoading(true);
                  setRange(r.key);
                }}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  range === r.key ? "bg-accent text-bg" : "text-fg-muted hover:bg-bg-hover"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[260px]">
          {candles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-fg-muted">
              {loading ? "Carregando…" : "Cotação indisponível agora."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={candles} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`grad-${asset}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={selected.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={selected.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(v) => dayFormat.format(new Date(Number(v)))}
                  minTickGap={40}
                  {...CHART_AXIS_PROPS}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => (asset === "USDBRL" ? `R$ ${Number(v).toFixed(2)}` : formatBRLCompact(Number(v)))}
                  width={70}
                  {...CHART_AXIS_PROPS}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelFormatter={(v) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(Number(v)))}
                  formatter={(v) => [formatBRL(Number(v)), selected.name]}
                />
                <Area type="monotone" dataKey="close" stroke={selected.color} strokeWidth={2} fill={`url(#grad-${asset})`} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
