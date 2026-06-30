import { useState } from "react";
import type { PoolState } from "./hooks/useMining";
import { useRonitePrice } from "./lib/price";
import { formatTokenAmountCompact, formatUsd, formatCompact } from "./lib/format";
import { GECKOTERMINAL_EMBED_URL, GECKOTERMINAL_POOL_URL } from "./lib/chain";
import { ORE_ICON } from "./Oreicons";

function PriceModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay price-overlay" role="dialog" aria-modal="true" aria-label="RONITE price chart">
      <div className="modal-box price-box">
        <div className="modal-header price-header">
          <span className="modal-title">📈 RONITE / WRON</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="price-chart-wrap">
          <iframe
            title="GeckoTerminal RONITE/WRON chart"
            src={GECKOTERMINAL_EMBED_URL}
            frameBorder="0"
            allow="clipboard-write"
            allowFullScreen
          />
        </div>
        <div className="modal-footer">
          <a
            className="btn btn--primary"
            href={GECKOTERMINAL_POOL_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open full chart ↗
          </a>
        </div>
      </div>
    </div>
  );
}

export function StatsBar({
  pools,
}: {
  pools: PoolState[];
}) {
  const [showPrice, setShowPrice] = useState(false);
  const { priceUsd, change24hPct, loading: priceLoading, error: priceError } = useRonitePrice();

  const tvlRonite = pools.reduce((sum, p) => sum + p.totalStaked, 0n);
  const tvlRoniteNum = Number(tvlRonite) / 1e18;
  const tvlUsd = priceUsd != null ? tvlRoniteNum * priceUsd : null;

  const totalOreMined = pools.reduce((sum, p) => {
    return sum + Number(p.globalMinted) / 10 ** (p.rewardDecimals || 18);
  }, 0);

  const livePools = pools.filter(p => p.miningActive);

  const changeColor = change24hPct == null ? "var(--text-muted)" : change24hPct >= 0 ? "#4ade80" : "#f87171";
  const changeArrow  = change24hPct == null ? "" : change24hPct >= 0 ? "▲" : "▼";

  return (
    <>
      <section className="stats-bar">
        <div className="stats-bar-header">
          <span className="status-dot status-dot--live" aria-hidden="true" />
          <span className="stats-bar-title">RONITE MINER — LIVE NETWORK STATS</span>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card-label">🔒 Total Value Locked</span>
            <span className="stat-card-value mono">{formatTokenAmountCompact(tvlRonite, 18)} <small>RONITE</small></span>
            <span className="stat-card-sub mono">
              {tvlUsd != null ? `≈ ${formatUsd(tvlUsd)}` : "fetching price…"}
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-card-label">⛏ Ore Mined (All-Time)</span>
            <span className="stat-card-value mono">{formatCompact(totalOreMined)}</span>
            <span className="stat-card-sub mono">across {pools.length} pools</span>
          </div>

          <div className="stat-card">
            <span className="stat-card-label">⚡ Pools Mining</span>
            <span className="stat-card-value mono">
              <span className="stats-live-dot" aria-hidden="true" />
              {livePools.length}/{pools.length} <small>LIVE</small>
            </span>
            <span className="stat-card-sub mono">
              {livePools.length > 0 ? livePools.map(p => p.symbol).join(" · ") : "no active periods"}
            </span>
          </div>

          <button
            className="stat-card stat-card--price"
            onClick={() => setShowPrice(true)}
          >
            <span className="stat-card-label">💹 RONITE Price</span>
            <span className="stat-card-value mono">
              {priceLoading ? "…" : priceError ? "tap to view" : formatUsd(priceUsd ?? 0, false)}
            </span>
            <span className="stat-card-sub mono" style={{ color: changeColor }}>
              {priceError ? "open live chart →" : change24hPct != null ? `${changeArrow} ${Math.abs(change24hPct).toFixed(2)}% 24h` : "tap for chart"}
            </span>
          </button>
        </div>

        <div className="stats-ore-strip">
          {pools.map(p => {
            const OreIcon = ORE_ICON[p.symbol];
            const mined = Number(p.globalMinted) / 10 ** (p.rewardDecimals || 18);
            return (
              <div key={p.symbol} className="stats-ore-item" style={{ "--ore-color": p.color } as React.CSSProperties}>
                {OreIcon && <OreIcon size={16} />}
                <span className="stats-ore-sym">{p.symbol}</span>
                <span className="stats-ore-amt mono">{formatCompact(mined)}</span>
              </div>
            );
          })}
        </div>
      </section>

      {showPrice && <PriceModal onClose={() => setShowPrice(false)} />}
    </>
  );
}
