import { useState, useRef } from "react";
import { formatUnits } from "ethers";
import { useMining } from "./hooks/useMining";
import { formatTokenAmount, formatTokenAmountPrecise, formatDuration, shortenAddress } from "./lib/format";
import type { PoolState } from "./hooks/useMining";
import { POOLS } from "./lib/chain";
import { PixelCatScene } from "./Pixelcatscene";
import { ORE_ICON } from "./Oreicons";
import { StatsBar } from "./Statsbar";

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

// ── Docs Modal ─────────────────────────────────────────────────────────────
type DocsBlock =
  | { type: "p";     text: string }
  | { type: "steps"; items: { step: string; title: string; desc: string }[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "kv";    items: { key: string; value: string }[] }
  | { type: "faq";   items: { q: string; a: string }[] };

const DOCS_SECTIONS: { id: string; icon: string; title: string; content: DocsBlock[] }[] = [
  {
    id: "overview",
    icon: "📖",
    title: "Overview",
    content: [
      {
        type: "p",
        text: "RONITE Miner is a DeFi mining protocol built on the Ronin blockchain. Stake RONITE tokens across four mining pools to earn ore rewards — COAL, IRON, GOLD, and DIAMOND.",
      },
      {
        type: "p",
        text: "Each pool has its own rarity tier, reward rate, and ore market where you can exchange earned ore back into RONITE.",
      },
    ],
  },
  {
    id: "howto",
    icon: "⛏",
    title: "How to Mine",
    content: [
      {
        type: "steps",
        items: [
          { step: "1", title: "Connect Wallet", desc: "Click Connect Wallet in the top-right. Ronin Wallet is recommended. The app will auto-switch to Ronin mainnet (chain ID 2020)." },
          { step: "2", title: "Buy RONITE", desc: "Use the Buy RONITE section. Fixed rate: 1 RON = 10 RONITE. RONITE is the staking token used across all pools." },
          { step: "3", title: "Approve RONITE", desc: "Before staking in any pool, you must first approve the pool contract to spend your RONITE. This is a one-time transaction per pool." },
          { step: "4", title: "Stake", desc: "Enter the amount of RONITE to stake in your chosen pool and click Stake. Use the MAX button to stake your full balance." },
          { step: "5", title: "Earn Ore", desc: "Once staked, ore rewards accumulate in real time. The live counter updates every 200ms based on your share of the pool." },
          { step: "6", title: "Claim Rewards", desc: "Click Claim on any pool to collect your ore tokens, or use Claim All to sweep all pools at once." },
          { step: "7", title: "Sell Ore", desc: "Switch to the Sell tab on any pool card to exchange your ore for RONITE at the listed market rate. Requires 2 transactions: approve + sell." },
        ],
      },
    ],
  },
  {
    id: "pools",
    icon: "🪨",
    title: "Mining Pools",
    content: [
      {
        type: "table",
        headers: ["Pool", "Rarity", "Sell Rate", "Notes"],
        rows: [
          ["⬜ COAL",    "Common",    "1,000 COAL = 1 RONITE",    "Highest volume, easiest entry"],
          ["🟦 IRON",    "Uncommon",  "100 IRON = 10 RONITE",     "Balanced risk/reward"],
          ["🟨 GOLD",    "Rare",      "500 GOLD = 10 RONITE",     "Higher reward rate"],
          ["💎 DIAMOND", "Legendary", "100 DIAMOND = 1 RONITE",   "Lowest supply, highest rarity"],
        ],
      },
      {
        type: "p",
        text: "Pool rewards are distributed proportionally based on your staked RONITE relative to the total pool stake. Higher stake = higher share of rewards.",
      },
    ],
  },
  {
    id: "tokenomics",
    icon: "💎",
    title: "Tokenomics",
    content: [
      {
        type: "p",
        text: "RONITE is the core staking token of the protocol. It has a fixed maximum supply enforced by the smart contract.",
      },
      {
        type: "kv",
        items: [
          { key: "Buy Rate",    value: "1 RON = 10 RONITE (fixed)" },
          { key: "Max Supply",  value: "Capped on-chain via maxSupply()" },
          { key: "Minting",     value: "Only via buy() or ownerMint()" },
          { key: "Ore Tokens",  value: "COAL, IRON, GOLD, DIAMOND — each an ERC-20 reward token" },
          { key: "Ore Markets", value: "Each ore pool has a dedicated market contract holding RONITE reserves" },
        ],
      },
      {
        type: "p",
        text: "The supply bar on the dashboard shows live minted vs max supply. Once max supply is reached, no new RONITE can be minted through the buy function.",
      },
    ],
  },
  {
    id: "contracts",
    icon: "📋",
    title: "Contracts & Security",
    content: [
      {
        type: "p",
        text: "All contract addresses can be verified directly in the app. Each pool card has a collapsible Contract Addresses section with links to the Ronin Explorer.",
      },
      {
        type: "kv",
        items: [
          { key: "Network",      value: "Ronin Mainnet — Chain ID 2020" },
          { key: "Explorer",     value: "explorer.roninchain.com" },
          { key: "RONITE Token", value: "ERC-20 + buy() + ownerMint()" },
          { key: "Pool Mining",  value: "Staking contract per pool (stake / withdraw / getReward)" },
          { key: "Ore Token",    value: "ERC-20 reward token per pool" },
          { key: "Ore Market",   value: "sell() ore → RONITE at fixed rate" },
        ],
      },
      {
        type: "p",
        text: "Always verify contract addresses on the explorer before interacting. Never share your seed phrase or private key with anyone.",
      },
    ],
  },
  {
    id: "faq",
    icon: "❓",
    title: "FAQ",
    content: [
      {
        type: "faq",
        items: [
          { q: "Why do I need 2 transactions to sell ore?", a: "The first transaction approves the market contract to spend your ore tokens (ERC-20 approval). The second executes the sell. This is standard ERC-20 behaviour." },
          { q: "Why is mining not active on my pool?", a: "Each pool has a periodFinish timestamp. If the period has ended, no new rewards accumulate until the admin adds a new reward period." },
          { q: "What happens if the market runs out of RONITE?", a: "The sell() call will revert with InsufficientRonite. The admin needs to deposit more RONITE into the market contract before selling resumes." },
          { q: "Can I stake in multiple pools at once?", a: "Yes. Each pool is an independent contract. You can stake RONITE across all four pools simultaneously." },
          { q: "Is there a minimum stake amount?", a: "No hard minimum on-chain, but very small amounts may earn negligible rewards depending on pool size." },
          { q: "How is the live reward counter calculated?", a: "The frontend estimates accrual locally using your staked amount, pool reward rate, and time elapsed since last on-chain sync. The true value is confirmed on-chain when you claim." },
        ],
      },
    ],
  },
];

function DocsModal({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState("overview");
  const section = DOCS_SECTIONS.find(s => s.id === activeSection) ?? DOCS_SECTIONS[0];

  return (
    <div className="modal-overlay docs-overlay" role="dialog" aria-modal="true" aria-label="Documentation">
      <div className="modal-box docs-box">
        {/* Header */}
        <div className="modal-header docs-header">
          <span className="modal-title">📖 RONITE Miner — Docs</span>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="docs-layout">
          {/* Sidebar nav */}
          <nav className="docs-nav">
            {DOCS_SECTIONS.map(s => (
              <button
                key={s.id}
                className={`docs-nav-item ${activeSection === s.id ? "docs-nav-item--active" : ""}`}
                onClick={() => setActiveSection(s.id)}
              >
                <span className="docs-nav-icon">{s.icon}</span>
                <span>{s.title}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="docs-content">
            <h3 className="docs-section-title">{section.icon} {section.title}</h3>
            {section.content.map((block, i) => {
              if (block.type === "p") {
                return <p key={i} className="docs-p">{block.text}</p>;
              }
              if (block.type === "steps") {
                return (
                  <ol key={i} className="docs-steps">
                    {block.items!.map(item => (
                      <li key={item.step} className="docs-step">
                        <span className="docs-step-num">{item.step}</span>
                        <div className="docs-step-body">
                          <strong className="docs-step-title">{item.title}</strong>
                          <p className="docs-step-desc">{item.desc}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              }
              if (block.type === "table") {
                return (
                  <div key={i} className="docs-table-wrap">
                    <table className="docs-table">
                      <thead>
                        <tr>{block.headers!.map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {block.rows!.map((row, ri) => (
                          <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              }
              if (block.type === "kv") {
                return (
                  <dl key={i} className="docs-kv">
                    {block.items!.map(item => (
                      <div key={item.key} className="docs-kv-row">
                        <dt className="docs-kv-key">{item.key}</dt>
                        <dd className="docs-kv-val mono">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                );
              }
              if (block.type === "faq") {
                return (
                  <div key={i} className="docs-faq">
                    {block.items!.map(item => (
                      <details key={item.q} className="docs-faq-item">
                        <summary className="docs-faq-q">{item.q}</summary>
                        <p className="docs-faq-a">{item.a}</p>
                      </details>
                    ))}
                  </div>
                );
              }
              return null;
            })}
          </div>
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
    IRON:    "100 IRON = 10 RONITE",
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
        {address && (
          <div className="stat-row stat-row--highlight">
            <dt>⛏ Total mined</dt>
            <dd className="mono" style={{ color: pool.color }}>
              {formatTokenAmount(pool.totalMined, pool.rewardDecimals)} {pool.symbol}
            </dd>
          </div>
        )}
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
            Requires 2 signed transactions (approve + sell).
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
    connect, approveRonite, stake, withdraw, claim, claimAll, sellOre,
  } = useMining();

  const [modalError, setModalError] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
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
        <div className="topbar-right">
          <button className="btn btn--docs" onClick={() => setShowDocs(true)}>📖 Docs</button>
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
        </div>
      </header>

      <main className="content">
        <StatsBar pools={pools} />

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

        {/* ── Total Ore Mined Summary ───────────────────────────────────── */}
        {address && pools.some(p => p.totalMined > 0n) && (
          <section className="ore-summary">
            <div className="ore-summary-title">⛏ Total Ore Mined (All Time)</div>
            <div className="ore-summary-grid">
              {pools.map(pool => {
                const OreIcon = ORE_ICON[pool.symbol];
                return (
                  <div key={pool.symbol} className="ore-summary-item" style={{ "--ore-color": pool.color } as React.CSSProperties}>
                    <div className="ore-summary-icon">
                      {OreIcon && <OreIcon size={22} />}
                    </div>
                    <div className="ore-summary-data">
                      <span className="ore-summary-sym">{pool.symbol}</span>
                      <span className="ore-summary-amount mono" style={{ color: pool.color }}>
                        {formatTokenAmount(pool.totalMined, pool.rewardDecimals, 2)}
                      </span>
                      <span className="ore-summary-sub">
                        wallet: {formatTokenAmount(pool.oreBalance, pool.rewardDecimals, 2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
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
        {showDocs && (
          <DocsModal onClose={() => setShowDocs(false)} />
        )}
      </main>

      <footer className="footer">Copyright Ronite 2026 · Built on Ronin mainnet · chain id 2020</footer>
    </div>
  );
}
