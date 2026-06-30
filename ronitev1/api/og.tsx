// api/og.tsx — RONITE Miner live share-preview image (Vercel Edge Function)
// ============================================================================
// Serves: GET /api/og  →  1200x630 PNG, rendered fresh from live on-chain /
// backend / price data on every request (edge-cached for a few minutes so
// crawler hits don't hammer your backend).
//
// Why this exists instead of a static public/og-image.png:
// On Vercel, `public/` is baked into the build and is immutable at runtime —
// nothing can rewrite it after deploy. This Edge Function sidesteps that by
// generating the image on demand instead of pre-baking it.
//
// Setup:
//   npm install @vercel/og
//   (Vercel auto-detects any file under /api as a Function; the
//   `export const config = { runtime: "edge" }` below is what makes it an
//   Edge Function, which is required by @vercel/og's ImageResponse.)
//
// Then point your OG meta tag at:
//   <meta property="og:image" content="https://ronite.fun/api/og" />
//
// Env vars to set in Vercel dashboard (Project → Settings → Environment Variables):
//   RONITE_BACKEND_URL   e.g. https://api.ronite.fun   (same one the frontend uses)

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const GECKO_API_URL =
  "https://api.geckoterminal.com/api/v2/networks/ronin/pools/0x591bf4bcb12ca203e2f8510a7c2c63d5a5c97fd4";

const POOL_COLORS: Record<string, string> = {
  COAL: "#94a3b8",
  IRON: "#a855f7",
  GOLD: "#f59e0b",
  DIAMOND: "#60a5fa",
};
const ALL_POOLS = ["COAL", "IRON", "GOLD", "DIAMOND"];

// Shown only if both the backend and the price API are unreachable — keeps
// the endpoint always returning a valid image instead of a broken preview.
const FALLBACK = {
  tvlRonite: 1_250_000,
  oreMined: 18_600_000,
  priceUsd: 0.0386,
  changePct: 4.2,
  livePools: ["COAL", "IRON", "GOLD", "DIAMOND"] as string[],
};

function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  return n.toFixed(2).replace(/\.?0+$/, "");
}
function usd(n: number): string {
  return n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toFixed(4)}`;
}

async function fetchLiveStats() {
  let tvlRonite: number | null = null;
  let oreMined: number | null = null;
  let livePools: string[] = [];
  let priceUsd: number | null = null;
  let changePct: number | null = null;

  const backendUrl = process.env.RONITE_BACKEND_URL;
  if (backendUrl) {
    try {
      const res = await fetch(`${backendUrl}/api/stats`, {
        next: { revalidate: 0 },
      } as RequestInit & { next?: { revalidate: number } });
      if (res.ok) {
        const data = await res.json();
        const pools: any[] = data.pools ?? [];
        tvlRonite = pools.reduce((s, p) => s + Number(p.totalStaked) / 1e18, 0);
        oreMined = pools.reduce((s, p) => s + Number(p.globalMinted) / 10 ** (p.rewardDecimals ?? 18), 0);
        livePools = pools.filter((p) => p.miningActive).map((p) => p.symbol);
      }
    } catch {
      /* fall through to fallback */
    }
  }

  try {
    const res = await fetch(GECKO_API_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; RoniteOGBot/1.0)" },
    });
    if (res.ok) {
      const json = await res.json();
      const attrs = json?.data?.attributes;
      if (attrs?.base_token_price_usd != null) priceUsd = Number(attrs.base_token_price_usd);
      if (attrs?.price_change_percentage?.h24 != null) changePct = Number(attrs.price_change_percentage.h24);
    }
  } catch {
    /* fall through to fallback */
  }

  return {
    tvlRonite: tvlRonite ?? FALLBACK.tvlRonite,
    oreMined: oreMined ?? FALLBACK.oreMined,
    priceUsd: priceUsd ?? FALLBACK.priceUsd,
    changePct: changePct ?? FALLBACK.changePct,
    livePools: livePools.length ? livePools : FALLBACK.livePools,
  };
}

// 16x16 grid pixel-cat (idle, gold palette), same coordinates as Pixelcatscene.tsx
const CAT_CELLS: { x: number; y: number; w: number; h: number; color: string }[] = [
  { x: 3, y: 7, w: 10, h: 7, color: "#8a6a20" },   // body
  { x: 4, y: 2, w: 8, h: 7, color: "#b08030" },    // head
  { x: 4, y: 1, w: 2, h: 2, color: "#b08030" },
  { x: 10, y: 1, w: 2, h: 2, color: "#b08030" },
  { x: 4, y: 0, w: 2, h: 1, color: "#6a4a10" },
  { x: 10, y: 0, w: 2, h: 1, color: "#6a4a10" },
  { x: 5, y: 4, w: 2, h: 2, color: "#ff88cc" },
  { x: 9, y: 4, w: 2, h: 2, color: "#ff88cc" },
  { x: 5, y: 4, w: 1, h: 1, color: "#000000" },
  { x: 9, y: 4, w: 1, h: 1, color: "#000000" },
  { x: 8, y: 6, w: 1, h: 1, color: "#ffaaaa" },
  { x: 5, y: 6, w: 2, h: 1, color: "#c86464" },
  { x: 10, y: 6, w: 2, h: 1, color: "#c86464" },
  { x: 4, y: 13, w: 2, h: 2, color: "#6a4a10" },
  { x: 10, y: 13, w: 2, h: 2, color: "#6a4a10" },
  { x: 2, y: 10, w: 2, h: 1, color: "#6a4a10" },
  { x: 1, y: 9, w: 2, h: 2, color: "#6a4a10" },
];

function StatCard({
  label, value, sub, accent,
}: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 290,
        background: "#181d28",
        border: "2px solid #2a3348",
        borderTop: `5px solid ${accent}`,
        boxShadow: "5px 5px 0 #000",
        padding: "16px",
      }}
    >
      <div style={{ display: "flex", fontSize: 13, color: "#5a6a8a", letterSpacing: 1 }}>{label}</div>
      <div style={{ display: "flex", fontSize: 30, color: "#dce8ff", marginTop: 12 }}>{value}</div>
      <div style={{ display: "flex", fontSize: 12, color: accent, marginTop: 14 }}>{sub}</div>
    </div>
  );
}

export default async function handler(req: Request) {
  const stats = await fetchLiveStats();
  const tvlUsd = stats.tvlRonite * stats.priceUsd;
  const up = stats.changePct >= 0;

  const fontData = await fetch(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/PressStart2P-Regular.ttf"
  ).then((r) => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0c0e14",
          border: "4px solid #2563eb",
          padding: 48,
          fontFamily: "PixelFont",
          position: "relative",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 44, height: 44, marginRight: 18,
              background: "#4fd1ff", transform: "rotate(45deg)",
              border: "2px solid #a0e8ff",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 38, color: "#60a5fa" }}>RONITE MINER</div>
            <div style={{ display: "flex", fontSize: 15, color: "#5a6a8a", marginTop: 8 }}>
              DeFi MINING PROTOCOL ON RONIN · ronite.fun
            </div>
          </div>
        </div>

        {/* live badge */}
        <div
          style={{
            display: "flex", alignItems: "center", position: "absolute",
            top: 50, right: 48, border: "2px solid #22c55e", padding: "10px 16px",
            background: "#181d28",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 5, background: "#22c55e", marginRight: 10, display: "flex" }} />
          <div style={{ display: "flex", fontSize: 12, color: "#22c55e" }}>LIVE NETWORK STATS</div>
        </div>

        {/* stat cards */}
        <div style={{ display: "flex", gap: 22, marginTop: 50 }}>
          <StatCard label="TVL LOCKED" value={compact(stats.tvlRonite)} sub={`RONITE · approx ${usd(tvlUsd)}`} accent="#60a5fa" />
          <StatCard label="ORE MINED (ALL-TIME)" value={compact(stats.oreMined)} sub="across 4 pools" accent="#f2b84b" />
          <StatCard
            label="RONITE PRICE"
            value={usd(stats.priceUsd)}
            sub={`${up ? "UP" : "DOWN"} ${Math.abs(stats.changePct).toFixed(2)}% · 24H`}
            accent="#22c55e"
          />
        </div>

        {/* pools mining live */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
          <div style={{ display: "flex", fontSize: 13, color: "#5a6a8a" }}>POOLS MINING LIVE</div>
          <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
            {ALL_POOLS.map((sym) => {
              const isLive = stats.livePools.includes(sym);
              return (
                <div
                  key={sym}
                  style={{
                    display: "flex", alignItems: "center", background: "#12161f",
                    border: "2px solid #2a3348", borderLeft: `5px solid ${isLive ? POOL_COLORS[sym] : "#3c4454"}`,
                    padding: "10px 16px",
                  }}
                >
                  <div style={{ display: "flex", fontSize: 12, color: isLive ? "#dce8ff" : "#5a6a8a" }}>{sym}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* pixel cat mascot */}
        <div style={{ display: "flex", position: "absolute", right: 90, top: 320, width: 208, height: 208 }}>
          {CAT_CELLS.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex", position: "absolute",
                left: c.x * 13, top: c.y * 13, width: c.w * 13, height: c.h * 13,
                background: c.color,
              }}
            />
          ))}
        </div>

        {/* footer */}
        <div
          style={{
            display: "flex", position: "absolute", bottom: 48, left: 48, right: 48,
            borderTop: "2px solid #2a3348", paddingTop: 22, fontSize: 14, color: "#5a6a8a",
          }}
        >
          STAKE · MINE · CLAIM — Connect your Ronin Wallet at ronite.fun
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "PixelFont", data: fontData, style: "normal" }],
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
