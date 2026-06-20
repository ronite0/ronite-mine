/**
 * PixelCatScene — taruh ini di dalam App.tsx, di bawah import dan di atas function App()
 * Lalu pasang <PixelCatScene pools={pools} /> di dalam <main className="content">
 * sebelum section Buy RONITE.
 *
 * Contoh pemakaian di App.tsx:
 *   <main className="content">
 *     <PixelCatScene pools={pools} />   ← tambahkan baris ini
 *     <section className="buy-section"> ...
 */

import type { PoolState } from "./hooks/useMining";

const CAT_COLORS: Record<string, { body: string; head: string; ear: string; eye: string; tool: string; ore: string }> = {
  COAL:    { body:"#777",    head:"#999",   ear:"#555",   eye:"#ffd700", tool:"#c0c0c0", ore:"#94a3b8" },
  IRON:    { body:"#5a7a9a", head:"#7a9aba", ear:"#3a5a7a", eye:"#00ffcc", tool:"#e0e0e0", ore:"#cbd5e1" },
  GOLD:    { body:"#8a6a20", head:"#b08030", ear:"#6a4a10", eye:"#ff88cc", tool:"#ffd700", ore:"#f2b84b" },
  DIAMOND: { body:"#204860", head:"#306880", ear:"#103040", eye:"#ff4466", tool:"#4fd1ff", ore:"#4fd1ff" },
};

function PixelCat({
  symbol, label, mode,
}: {
  symbol: string; label: string; mode: "mine" | "idle" | "claim";
}) {
  const c = CAT_COLORS[symbol] ?? CAT_COLORS.COAL;
  const animClass =
    mode === "mine"  ? "cat-anim-mine"  :
    mode === "claim" ? "cat-anim-claim" :
    "cat-anim-idle";

  return (
    <div className="cat-unit">
      <div style={{ position: "relative" }}>
        {mode === "claim" && (
          <div className="coin-float">💰</div>
        )}
        <svg
          className={`pixel-cat-svg ${animClass}`}
          viewBox="0 0 16 16"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Body */}
          <rect x="3" y="7" width="10" height="7" fill={c.body} />
          {/* Head */}
          <rect x="4" y="2" width="8" height="7" fill={c.head} />
          {/* Ears */}
          <rect x="4" y="1" width="2" height="2" fill={c.head} />
          <rect x="10" y="1" width="2" height="2" fill={c.head} />
          <rect x="4" y="0" width="2" height="1" fill={c.ear} />
          <rect x="10" y="0" width="2" height="1" fill={c.ear} />
          {/* Eyes */}
          <rect x="5" y="4" width="2" height="2" fill={c.eye} />
          <rect x="9" y="4" width="2" height="2" fill={c.eye} />
          <rect x="5" y="4" width="1" height="1" fill="#000" />
          <rect x="9" y="4" width="1" height="1" fill="#000" />
          {/* Nose */}
          <rect x="8" y="6" width="1" height="1" fill="#ffaaaa" />
          {/* Blush */}
          <rect x="5" y="6" width="2" height="1" fill="rgba(255,100,100,0.5)" />
          <rect x="10" y="6" width="2" height="1" fill="rgba(255,100,100,0.5)" />
          {/* Tool / accessory */}
          {mode === "mine" && (
            <>
              <rect x="13" y="5" width="3" height="1" fill={c.tool} />
              <rect x="14" y="4" width="2" height="1" fill={c.tool} />
              <rect x="14" y="3" width="1" height="1" fill={c.ear} />
            </>
          )}
          {mode === "claim" && (
            <>
              {/* Coin bag */}
              <rect x="7" y="10" width="4" height="3" fill="#ffd700" />
              <rect x="8" y="9"  width="2" height="2" fill="#ffd700" />
              <rect x="8" y="10" width="2" height="1" fill="#a06000" />
            </>
          )}
          {mode === "idle" && (
            <>
              {/* Zzz */}
              <rect x="13" y="1" width="2" height="1" fill="#fff" opacity="0.7" />
              <rect x="12" y="2" width="3" height="1" fill="#fff" opacity="0.5" />
            </>
          )}
          {/* Legs */}
          <rect x="4"  y="13" width="2" height="2" fill={c.ear} />
          <rect x="10" y="13" width="2" height="2" fill={c.ear} />
          {/* Tail */}
          <rect x="2" y="10" width="2" height="1" fill={c.ear} />
          <rect x="1" y="9"  width="2" height="2" fill={c.ear} />
        </svg>

        {/* Ore bits flying when mining */}
        {mode === "mine" && (
          <div className="ore-bits">
            <div
              className="ore-bit"
              style={{ background: c.ore, "--d": "0.7s", "--delay": "0s", "--tx": "10px", "--ty": "-14px" } as React.CSSProperties}
            />
            <div
              className="ore-bit"
              style={{ background: c.ore, "--d": "0.9s", "--delay": "0.25s", "--tx": "18px", "--ty": "-8px" } as React.CSSProperties}
            />
            <div
              className="ore-bit"
              style={{ background: "#fff", "--d": "0.6s", "--delay": "0.45s", "--tx": "6px", "--ty": "-18px" } as React.CSSProperties}
            />
          </div>
        )}
      </div>
      <div className="cat-unit-label">{label}</div>
    </div>
  );
}

export function PixelCatScene({ pools }: { pools: PoolState[] }) {
  return (
    <div className="pixel-cat-scene">
      {pools.map(pool => {
        const mode =
          pool.staked > 0n && pool.miningActive ? "mine" :
          pool.pendingReward > 0n ? "claim" :
          "idle";
        const label =
          mode === "mine"  ? `⚒ Mining ${pool.symbol}` :
          mode === "claim" ? `💰 Claim ${pool.symbol}!` :
          `😴 Idle`;
        return (
          <PixelCat
            key={pool.symbol}
            symbol={pool.symbol}
            label={label}
            mode={mode}
          />
        );
      })}
    </div>
  );
}