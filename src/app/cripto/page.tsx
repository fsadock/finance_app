import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { getCryptoPortfolio } from "@/lib/data/crypto";
import { ASSET_NAME, type CryptoSymbol } from "@/lib/domain/crypto";
import { formatBRL, formatCryptoAmount, formatUSD } from "@/lib/domain/format";
import { MarketPanel, type MarketAsset } from "@/components/crypto/market-panel";
import { PortfolioChart } from "@/components/crypto/portfolio-chart";
import { CryptoWallets } from "@/components/crypto/wallets";
import { cn } from "@/lib/utils";
import { CHART_SYMBOLS, type ChartSymbol } from "@/lib/market/prices";

const ASSET_COLOR: Record<string, string> = {
  BTC: "#f7931a",
  SOL: "#9945ff",
  USDC: "#2775ca",
  USDT: "#26a17b",
};

/** Every asset the app prices has a BRL pair on Binance, so anything held can be charted. */
const CHARTABLE = new Set<string>(CHART_SYMBOLS);

// Preços ao vivo: nada aqui pode ser gerado no build.
export const dynamic = "force-dynamic";

export default async function CryptoPage() {
  const { wallets, quotes, dollar, total, allocation, history, purchases } = await getCryptoPortfolio();

  // only what this person holds, plus the dollar — which prices everything here.
  // With no wallet yet, show the usual suspects so the page has something to say.
  const held: string[] = allocation.length > 0 ? [...new Set(allocation.map((a) => a.symbol))] : ["BTC", "SOL"];
  const assets: MarketAsset[] = [
    ...held.flatMap((symbol) =>
      CHARTABLE.has(symbol) ? [{ key: symbol as ChartSymbol, name: ASSET_NAME[symbol], color: ASSET_COLOR[symbol] ?? "#6b7280" }] : []
    ),
    { key: "USDBRL" as const, name: "Dólar", color: "var(--color-accent)" },
  ];
  const empty = wallets.length === 0;

  return (
    <>
      <PageHeader title="Cripto" subtitle="Saldos lidos da blockchain pelo endereço público da carteira" />

      {!empty && (
        <div className="grid grid-cols-12 gap-4 mb-4">
          <Card className="col-span-12 lg:col-span-4 flex flex-col justify-center">
            <div className="text-sm text-fg-muted">Total em cripto</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums break-words sm:text-3xl">{formatBRL(total.brl)}</div>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-fg-muted tabular-nums">{formatUSD(total.usd)}</span>
              {total.change24h !== null && (
                <span className={cn("font-medium tabular-nums", total.change24h >= 0 ? "text-accent" : "text-danger")}>
                  {total.change24h >= 0 ? "▲" : "▼"} {Math.abs(total.change24h).toFixed(2).replace(".", ",")}% em 24h
                </span>
              )}
            </div>
            {dollar && (
              <div className="mt-4 text-xs text-fg-subtle">
                Convertido a R$ {dollar.rate.toFixed(4).replace(".", ",")} por dólar · {dollar.at.slice(0, 16)}
              </div>
            )}
          </Card>

          <Card className="col-span-12 lg:col-span-8">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Alocação</h2>
              <span className="text-xs text-fg-muted">{allocation.length} ativo(s)</span>
            </div>
            <ul className="space-y-3">
              {allocation.map((a) => (
                <li key={a.symbol}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: ASSET_COLOR[a.symbol] ?? "#6b7280" }} />
                      <span className="truncate">{ASSET_NAME[a.symbol]}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatBRL(a.value)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-elev">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, a.share * 100)}%`, background: ASSET_COLOR[a.symbol] ?? "#6b7280" }}
                    />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-fg-muted">
                    <span className="tabular-nums">{formatCryptoAmount(a.quantity)}</span>
                    <span className="tabular-nums">{a.share > 0 && a.share < 0.01 ? "menos de 1" : Math.round(a.share * 100)}%</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {history.length > 1 && (
        <Card className="mb-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Evolução das carteiras</h2>
            <span className="text-xs text-fg-muted">um ponto por dia, desde que o app começou a acompanhar</span>
          </div>
          <PortfolioChart data={history} />
        </Card>
      )}

      <section className="mb-4 space-y-3">
        <h2 className="font-semibold">Mercado</h2>
        <MarketPanel initial={{ quotes, dollar }} assets={assets} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Carteiras</h2>
          <p className="text-xs text-fg-muted">
            Só o endereço público é guardado. Com ele o app lê saldos e nada mais — não dá para mover nada.
          </p>
        </div>
        <CryptoWallets wallets={wallets} purchases={purchases} />
      </section>
    </>
  );
}
