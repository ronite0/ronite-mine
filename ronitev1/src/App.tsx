import { useState, useRef } from "react";
import { formatUnits } from "ethers";
import { useMining } from "./hooks/useMining";
import { formatTokenAmount, formatTokenAmountPrecise, formatDuration, shortenAddress } from "./lib/format";
import type { PoolState } from "./hooks/useMining";
import { POOLS } from "./lib/chain";
import { PixelCatScene } from "./Pixelcatscene";
import { ORE_ICON } from "./Oreicons";

// ── Error Modal ────────────────────────────────────────────────────────────
function ErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  const isInsufficientFunds = /insufficient funds/i.test(message);
  const isSellFailed        = /execution reverted/i.test(message) || /sell failed/i.test(message);
  const isMarketPaused      = /paused/i.test(message);
  const isInsufficientOre   = /minimum sell|notenoughore/i.test(message);
  const isOutOfRonite       = /out of ronite/i.test(message);

  const title = isInsufficientFunds
    ? "⛽ Insufficient Funds"
    : isMarketPaused
    ? "⏸ Market Paused"
    : isInsufficientOre
    ? "⚖ Amount Too Low"
    : isOutOfRonite
    ? "🏦 Market Empty"
    : isSellFailed
    ? "❌ Transaction Reverted"
    : "⚠ Transaction Error";

  const hint = isInsufficientFunds
    ? "Your wallet doesn't have enough RON to cover gas fees. Top up your RON balance and try again."
    : isMarketPaused
    ? "This ore market is currently paused by the admin. Check back later."
    : isInsufficientOre
    ? "You need to sell a larger amount to receive at least 1 RONITE. Check the minimum sell rate shown on the card."
    : isOutOfRonite
    ? "The market contract has run out of RONITE reserves. Contact the admin to refill it."
    : isSellFailed
    ? "The blockchain rejected this transaction. This usually means a contract condition wasn't met."
    : "Something went wrong. Check your wallet and try again.";

  // Shorten raw error for display
  const rawSnippet = message.length > 120 ? message.slice(0, 120) + "…" : message;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Transaction error">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <p className="modal-hint">{hint}</p>
          <div className="modal-raw">
            <span className="modal-raw-label">Detail:</span>
            <span className="modal-raw-text mono">{rawSnippet}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn--primary" onClick={onClose}>OK, got it</button>
        </div>
      </div>
    </div>
  );
}

const RARITY_LABEL: Record<string, string> = {
  common: "⬜ Common", uncommon: "🟦 Uncommon", rare: "🟨 Rare", legendary: "💎 Legendary"
};

const ORE_EMOJI: Record<string, string> = {
  COAL: "🪨", IRON: "⚙️", GOLD: "✨", DIAMOND: "💎"
};

function PoolCard({
  pool, address, pendingAction, roniteBalance, roniteAllowance,
  onApprove, onStake, onWithdraw, onClaim, onSell,
}: {
  pool: PoolState;
  address: string | null;
  pendingAction: string | null;
  roniteBalance: bigint;
  roniteAllowance: Record<string, bigint>;
  onApprove: (sym: string, amt: string) => void;
  onStake:   (sym: string, amt: string) => void;
  onWithdraw:(sym: string, amt: string) => void;
  onClaim:   (sym: string) => void;
  onSell:    (sym: string, amt: string) => void;
}) {
  const [stakeAmt,    setStakeAmt]    = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [sellAmt,     setSellAmt]     = useState("");
  const [activeTab,   setActiveTab]   = useState<"mine" | "sell">("mine");
  const [showCA,      setShowCA]      = useState(false);

  const poolConfig = POOLS.find(p => p.symbol === pool.symbol);

  const secondsLeft = Math.max(0, pool.periodFinish - Math.floor(Date.now() / 1000));
  const netShare = pool.totalStaked > 0n
    ? Number((pool.staked * 10000n) / pool.totalStaked) / 100
    : 0;
  const dailyEst = pool.totalStaked > 0n && pool.staked > 0n
    ? (Number(pool.staked) / Number(pool.totalStaked)) * Number(pool.rewardRate) * 86400
    : 0;

  const allowance = roniteAllowance[pool.symbol] ?? 0n;
  const stakeWei  = stakeAmt ? BigInt(Math.floor(Number(stakeAmt) * 1e18)) : 0n;
  const needsApproval = stakeWei > 0n && allowance < stakeWei;
  const isLoading = (key: string) => pendingAction === key;

  // orePerRonite: how many ore = 1 RONITE (used for UI estimate only)
  const ORE_PER_RONITE: Record<string, number> = {
    COAL: 1000, IRON: 100, GOLD: 50, DIAMOND: 100
  };
  const rate = ORE_PER_RONITE[pool.symbol] ?? 1000;
  const sellEstRonite = sellAmt ? Number(sellAmt) / rate : 0;
  const RATE_LABEL: Record<string, string> = {
    COAL:    "1000 COAL = 1 RONITE",
    IRON:    "1000 IRON = 10 RONITE",
    GOLD:    "500 GOLD = 10 RONITE",
    DIAMOND: "100 DIAMOND = 1 RONITE",
  };
  const rateLabel = RATE_LABEL[pool.symbol] ?? `${rate} ${pool.symbol} = 1 RONITE`;
  const OreIcon = ORE_ICON[pool.symbol];

  return (
    <div className="pool-card" style={{ "--pool-color": pool.color } as React.CSSProperties}>
      <div className="pool-header">
        <div>
          <span className="pool-rarity">{RARITY_LABEL[pool.rarity]}</span>
          <h2 className="pool-name">
            {OreIcon && <OreIcon size={20} style={{ verticalAlign: "middle", marginRight: 6 }} />}
            {pool.name}
            </h2>
        </div>
        <div className="pool-live-reward">
          <span className="pool-live-label">Mining</span>
          <span className="pool-live-number mono" style={{ color: pool.color }}>
            {address && pool.staked > 0n
              ? formatTokenAmountPrecise(pool.liveReward, pool.rewardDecimals)
              : "0.000000"}
          </span>
          <span className="pool-live-sym">{pool.symbol}</span>
        </div>
      </div>

      <dl className="stat-list">
        <div className="stat-row">
          <dt>Your power</dt>
          <dd className="mono">{formatTokenAmount(pool.staked, 18)} RONITE</dd>
        </div>
        <div className="stat-row">
          <dt>Network share</dt>
          <dd className="mono">{netShare.toFixed(2)}%</dd>
        </div>
        <div className="stat-row">
          <dt>Est. per day</dt>
          <dd className="mono">~{formatTokenAmount(BigInt(Math.floor(dailyEst)), pool.rewardDecimals)} {pool.symbol}</dd>
        </div>
        <div className="stat-row">
          <dt>Total Ronite</dt>
          <dd className="mono">{formatTokenAmount(pool.totalStaked, 18)} RONITE</dd>
        </div>
        <div className="stat-row">
          <dt>Period ends</dt>
          <dd className="mono">{pool.miningActive ? formatDuration(secondsLeft) : "Not started"}</dd>
        </div>
        <div className="stat-row">
          <dt>Sell rate</dt>
          <dd className="mono" style={{ color: pool.color }}>{rateLabel}</dd>
        </div>
      </dl>

      {/* ── Contract Addresses ──────────────────────────────────── */}
      <div className="ca-section">
        <button
          className="ca-toggle"
          onClick={() => setShowCA(v => !v)}
          style={{ "--pool-color": pool.color } as React.CSSProperties}
        >
          <span className="ca-toggle-icon">{showCA ? "▼" : "▶"}</span>
          <span>Contract Addresses</span>
          <span className="ca-toggle-badge" style={{ background: pool.color }}>CA</span>
        </button>
        {showCA && poolConfig && (
          <div className="ca-list">
            {[
              { label: "Pool Mining", addr: poolConfig.stakingAddress },
              { label: "Ore Token",  addr: poolConfig.rewardTokenAddress },
              { label: "Market",     addr: poolConfig.oreMarketAddress },
            ].filter(r => !!r.addr).map(({ label, addr }) => (
              <div className="ca-row" key={label}>
                <span className="ca-label">{label}</span>
                <div className="ca-addr-wrap">
                  <a
                    className="ca-addr mono"
                    href={`https://explorer.roninchain.com/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={addr}
                  >
                    {addr!.slice(0, 6)}…{addr!.slice(-4)}
                  </a>
                  <button
                    className="ca-copy"
                    title="Copy address"
                    onClick={() => navigator.clipboard.writeText(addr!)}
                  >⧉</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="card-tabs">
        <button
          className={`tab-btn ${activeTab === "mine" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("mine")}
        >
          ⛏ Mine
        </button>
        <button
          className={`tab-btn ${activeTab === "sell" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("sell")}
        >
          💰 Sell {pool.symbol}
        </button>
      </div>

      {activeTab === "mine" ? (
        <div className="pool-actions">
          {/* Stake */}
          <div className="field-row">
            <div className="input-with-max">
              <input className="input" inputMode="decimal"
                placeholder="RONITE amount"
                value={stakeAmt}
                onChange={e => setStakeAmt(e.target.value)}
                disabled={!address}
              />
              <button
                className="btn btn--max"
                type="button"
                disabled={!address || roniteBalance === 0n}
                onClick={() => setStakeAmt(formatUnits(roniteBalance, 18))}
              >MAX</button>
            </div>
            {needsApproval ? (
              <button className="btn btn--accent"
                onClick={() => onApprove(pool.symbol, stakeAmt)}
                disabled={!address || !!pendingAction}>
                {isLoading(`approve-${pool.symbol}`) ? "Approving…" : "Approve"}
              </button>
            ) : (
              <button className="btn btn--accent"
                onClick={() => onStake(pool.symbol, stakeAmt)}
                disabled={!address || !stakeAmt || !!pendingAction}>
                {isLoading(`stake-${pool.symbol}`) ? "Staking…" : "Stake"}
              </button>
            )}
          </div>

          {/* Withdraw */}
          <div className="field-row">
            <div className="input-with-max">
              <input className="input" inputMode="decimal"
                placeholder="Withdraw amount"
                value={withdrawAmt}
                onChange={e => setWithdrawAmt(e.target.value)}
                disabled={!address}
              />
              <button
                className="btn btn--max"
                type="button"
                disabled={!address || pool.staked === 0n}
                onClick={() => setWithdrawAmt(formatUnits(pool.staked, 18))}
              >MAX</button>
            </div>
            <button className="btn"
              onClick={() => onWithdraw(pool.symbol, withdrawAmt)}
              disabled={!address || !withdrawAmt || !!pendingAction}>
              {isLoading(`withdraw-${pool.symbol}`) ? "…" : "Withdraw"}
            </button>
          </div>

          {/* Claim */}
          <div className="claim-row">
            <span className="claim-pending mono">
              {formatTokenAmount(pool.pendingReward, pool.rewardDecimals)} {pool.symbol} unclaimed
            </span>
            <button className="btn btn--primary"
              onClick={() => onClaim(pool.symbol)}
              disabled={!address || pool.pendingReward === 0n || !!pendingAction}>
              {isLoading(`claim-${pool.symbol}`) ? "Claiming…" : "Claim"}
            </button>
          </div>
        </div>
      ) : (
        <div className="pool-actions">
          {/* Sell panel */}
          <div className="sell-info-box" style={{ borderColor: pool.color }}>
            <div className="sell-info-row">
              <span className="sell-info-label">Exchange rate</span>
              <span className="sell-info-value mono" style={{ color: pool.color }}>
                {rateLabel}
              </span>
            </div>
            <div className="sell-info-row">
              <span className="sell-info-label">Your {pool.symbol} balance</span>
              <span className="sell-info-value mono">
                {formatTokenAmount(pool.oreBalance ?? 0n, pool.rewardDecimals)} {pool.symbol}
              </span>
            </div>
          </div>

          <div className="sell-input-group">
            <div className="buy-field" style={{ flex: 1 }}>
              <label className="buy-label">Amount to sell</label>
              <div className="input-with-max">
                <input className="input" inputMode="decimal"
                  placeholder={`0.0 ${pool.symbol}`}
                  value={sellAmt}
                  onChange={e => setSellAmt(e.target.value)}
                  disabled={!address}
                />
                <button
                  className="btn btn--max"
                  type="button"
                  disabled={!address || (pool.oreBalance ?? 0n) === 0n}
                  onClick={() => setSellAmt(formatUnits(pool.oreBalance ?? 0n, pool.rewardDecimals))}
                >MAX</button>
              </div>
            </div>
            <span className="buy-arrow">→</span>
            <div className="buy-field" style={{ flex: 1 }}>
              <label className="buy-label">You receive (RONITE)</label>
              <div className="buy-output mono" style={{ color: "#4ade80" }}>
                {sellEstRonite > 0 ? sellEstRonite.toLocaleString("en-US", { maximumFractionDigits: 18 }) : "0"} RONITE
              </div>
            </div>
          </div>

          <button className="btn btn--sell btn--wide"
            style={{ "--sell-color": pool.color } as React.CSSProperties}
            onClick={() => onSell(pool.symbol, sellAmt)}
            disabled={!address || !sellAmt || !!pendingAction}>
            {isLoading(`approve-sell-${pool.symbol}`)
              ? "Approving… (tx 1/2)"
              : isLoading(`sell-${pool.symbol}`)
              ? "Selling… (tx 2/2)"
              : `Sell ${pool.symbol} for RON`}
          </button>

          <p className="sell-disclaimer">
            ⚠ You trade {pool.symbol} tokens for RONITE at the listed rate.
            before selling {pool.symbol} you need Requires 2 signed transactions (approve + sell).
          </p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const {
    address, connecting, pendingAction, error,
    pools, roniteBalance, roniteAllowance,
    ronBalance, roniteSupply, roniteMaxSupply,
    connect, buyRonite, approveRonite, stake, withdraw, claim, claimAll, sellOre,
  } = useMining();

  const [buyAmount, setBuyAmount] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const roniteEst = buyAmount ? Number(buyAmount) * 10 : 0;
  const totalPending = pools.reduce((sum, p) => sum + p.pendingReward, 0n);

  // Show modal whenever useMining sets an error
  const prevError = useRef<string | null>(null);
  if (error && error !== prevError.current) {
    prevError.current = error;
    // defer so React doesn't complain about state-during-render
    Promise.resolve().then(() => setModalError(error));
  }

  return (
    <div className="page">
      <div className="grid-backdrop" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">⛏</span>
          <span className="brand-name">RONITE MINER</span>
        </div>
        {address ? (
          <div className="wallet-chip">
            <span className="status-dot status-dot--live" aria-hidden="true" />
            <span className="mono">{shortenAddress(address)}</span>
            <span className="chip-divider" />
            <span className="mono chip-ron">
              <span className="chip-token-label">RON</span>
              {formatTokenAmount(ronBalance, 18, 3)}
            </span>
            <span className="chip-divider" />
            <span className="mono chip-ronite">
              <span className="chip-token-label">RONITE</span>
              {formatTokenAmount(roniteBalance, 18)}
            </span>
          </div>
        ) : (
          <button className="btn btn--primary" onClick={connect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </header>

      <main className="content">
        <PixelCatScene pools={pools} />

        {/* ── RONITE Supply Bar ──────────────────────────────────────── */}
        {roniteMaxSupply > 0n && (() => {
          const pct = Number((roniteSupply * 10000n) / roniteMaxSupply) / 100;
          const minted    = formatTokenAmount(roniteSupply,    18, 0);
          const maxSupply = formatTokenAmount(roniteMaxSupply, 18, 0);
          return (
            <section className="supply-bar-section">
              <div className="supply-bar-header">
                <span className="supply-bar-label">⛏ RONITE Supply</span>
                <span className="supply-bar-nums mono">
                  <span className="supply-minted">{minted}</span>
                  <span className="supply-sep"> / </span>
                  <span className="supply-max">{maxSupply}</span>
                  <span className="supply-pct" style={{ marginLeft: 8 }}>({pct.toFixed(2)}%)</span>
                </span>
              </div>
              <div className="supply-track">
                <div
                  className="supply-fill"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
                {/* milestone ticks */}
                {[25, 50, 75].map(tick => (
                  <div key={tick} className="supply-tick" style={{ left: `${tick}%` }} />
                ))}
              </div>
              <div className="supply-bar-footer">
                <span className="supply-remaining mono">
                  {formatTokenAmount(roniteMaxSupply - roniteSupply, 18, 0)} RONITE remaining
                </span>
                <span className="supply-status" style={{ color: pct >= 90 ? "#f87171" : pct >= 60 ? "#fbbf24" : "#4ade80" }}>
                  {pct >= 90 ? "🔴 Nearly Full" : pct >= 60 ? "🟡 Over Half" : "🟢 Plenty Left"}
                </span>
              </div>
            </section>
          );
        })()}

        <section className="buy-section">
          <div className="buy-card">
            <div className="buy-info">
              <h2 className="buy-title">Buy RONITE</h2>
              <p className="buy-desc">Staking token for all mining pools. Fixed rate <strong>1 RON = 10 RONITE</strong>.</p>
            </div>
            <div className="buy-form">
              <div className="buy-input-group">
                <div className="buy-field">
                  <label className="buy-label">RON you pay</label>
                  <input className="input" inputMode="decimal"
                    placeholder="0.0"
                    value={buyAmount}
                    onChange={e => setBuyAmount(e.target.value)}
                    disabled={!address}
                  />
                </div>
                <span className="buy-arrow">→</span>
                <div className="buy-field">
                  <label className="buy-label">RONITE you receive</label>
                  <div className="buy-output mono">{roniteEst > 0 ? roniteEst.toLocaleString() : "0"} RONITE</div>
                </div>
              </div>
              <button className="btn btn--primary btn--wide"
                onClick={() => buyRonite(buyAmount)}
                disabled={!address || !buyAmount || !!pendingAction}>
                {pendingAction === "buyRonite" ? "Processing…" : "Buy RONITE"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Total pending + Claim All ────────────────────────────────── */}
        {address && totalPending > 0n && (
          <section className="claim-all-bar">
            <span>⛏ Unclaimed rewards available across all pools</span>
            <button className="btn btn--primary"
              onClick={claimAll}
              disabled={!!pendingAction}>
              {pendingAction?.startsWith("claim") ? "Claiming…" : "Claim All"}
            </button>
          </section>
        )}

        {/* ── Pool cards ───────────────────────────────────────────────── */}
        <section className="pools-grid">
          {pools.length === 0 ? (
            <p className="empty-state">No active pools. Fill in contract addresses in <code>.env</code> and restart the frontend.</p>
          ) : pools.map(pool => (
            <PoolCard key={pool.symbol}
              pool={pool}
              address={address}
              pendingAction={pendingAction}
              roniteBalance={roniteBalance}
              roniteAllowance={roniteAllowance}
              onApprove={approveRonite}
              onStake={stake}
              onWithdraw={withdraw}
              onClaim={claim}
              onSell={sellOre}
            />
          ))}
        </section>

        {modalError && (
          <ErrorModal message={modalError} onClose={() => setModalError(null)} />
        )}
      </main>

      <footer className="footer">Copyright Ronite 2026 · Built on Ronin mainnet · chain id 2020</footer>
    </div>
  );
}
