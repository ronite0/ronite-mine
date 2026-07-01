/**
 * AirdropClaim.tsx — Halaman Claim Airdrop dari RoniteAirdrop.sol
 *
 * Terintegrasi penuh dengan:
 *   - lib/wallet.ts   → connectWallet(), getInjectedProvider()
 *   - lib/chain.ts    → RONIN_MAINNET, RONITE_ADDRESS
 *   - lib/format.ts   → shortenAddress(), formatTokenAmount()
 *
 * Env yang perlu ditambah ke .env:
 *   VITE_AIRDROP_CONTRACT_ADDRESS=0x...
 *
 * Navigasi:  window.location.hash = "#claim"
 * Kembali:   window.location.hash = ""  atau "#airdrop"
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import { connectWallet, getInjectedProvider } from "./lib/wallet";
import { RONIN_MAINNET, RONITE_ADDRESS }       from "./lib/chain";
import { shortenAddress, formatTokenAmount }    from "./lib/format";

// ─── Config ───────────────────────────────────────────────────────────────────

const AIRDROP_ADDR = import.meta.env.VITE_AIRDROP_CONTRACT_ADDRESS as string | undefined;
const EXPLORER     = RONIN_MAINNET.blockExplorerUrls[0]; // "https://explorer.roninchain.com"

// Season 1 allocation is fully distributed — force the "ended" state on the
// frontend regardless of the on-chain isCampaignOpen() flag.
const AIRDROP_ENDED = true;

/** ABI minimal RoniteAirdrop.sol — hanya fungsi yang dipakai frontend */
const AIRDROP_ABI = [
  "function allocation(address wallet) view returns (uint256)",
  "function claimed(address wallet) view returns (bool)",
  "function isCampaignOpen() view returns (bool)",
  "function claimStart() view returns (uint256)",
  "function claimEnd() view returns (uint256)",
  "function totalAllocated() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function remainingBalance() view returns (uint256)",
  "function claim() external",
];

const readProvider = new JsonRpcProvider(
  RONIN_MAINNET.rpcUrls[0],
  { chainId: RONIN_MAINNET.chainId, name: "ronin" },
  { staticNetwork: true, batchMaxCount: 1 },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type ClaimStatus =
  | "idle"
  | "loading"
  | "eligible"
  | "claiming"
  | "claimed"
  | "already_claimed"
  | "not_allocated"
  | "campaign_closed"
  | "error";

interface ContractData {
  allocation:     bigint;
  claimed:        boolean;
  isOpen:         boolean;
  claimStartMs:   number;
  claimEndMs:     number;
  totalAllocated: bigint;
  totalClaimed:   bigint;
  remaining:      bigint;
}

// ─── Fetch contract data ──────────────────────────────────────────────────────

async function fetchContractData(wallet: string): Promise<ContractData | null> {
  if (!AIRDROP_ADDR) return null;
  try {
    const c = new Contract(AIRDROP_ADDR, AIRDROP_ABI, readProvider);
    const [alloc, clmd, isOpen, start, end, totAlloc, totClaimed, remaining] =
      await Promise.all([
        c.allocation(wallet)  as Promise<bigint>,
        c.claimed(wallet)     as Promise<boolean>,
        c.isCampaignOpen()    as Promise<boolean>,
        c.claimStart()        as Promise<bigint>,
        c.claimEnd()          as Promise<bigint>,
        c.totalAllocated()    as Promise<bigint>,
        c.totalClaimed()      as Promise<bigint>,
        c.remainingBalance()  as Promise<bigint>,
      ]);
    return {
      allocation:     alloc,
      claimed:        clmd,
      isOpen,
      claimStartMs:   Number(start) * 1000,
      claimEndMs:     Number(end)   * 1000,
      totalAllocated: totAlloc,
      totalClaimed:   totClaimed,
      remaining,
    };
  } catch (e) {
    console.error("[AirdropClaim] fetchContractData:", e);
    return null;
  }
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(endMs: number) {
  const [rem, setRem] = useState(() =>
    Math.max(0, Math.floor((endMs - Date.now()) / 1000)),
  );
  useEffect(() => {
    const id = setInterval(
      () => setRem(Math.max(0, Math.floor((endMs - Date.now()) / 1000))),
      1000,
    );
    return () => clearInterval(id);
  }, [endMs]);
  return {
    d: Math.floor(rem / 86400),
    h: Math.floor((rem % 86400) / 3600),
    m: Math.floor((rem % 3600) / 60),
    s: rem % 60,
    expired: rem === 0,
  };
}

// ─── Coin burst ───────────────────────────────────────────────────────────────

const BURST_ITEMS = ["💰", "⭐", "💎", "⛏", "🌟", "💰", "🪙", "✨"];
const BURST_CSS   = BURST_ITEMS.map((_, i) => {
  const angle = (i / BURST_ITEMS.length) * Math.PI * 2;
  const tx    = Math.round(Math.cos(angle) * 80);
  const ty    = Math.round(Math.sin(angle) * 80);
  return `@keyframes _bcb${i}{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(${tx}px,${ty}px) scale(0.4)}}`;
}).join("");

function CoinBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      <style>{BURST_CSS}</style>
      <div style={{ position: "fixed", top: "50%", left: "50%", pointerEvents: "none", zIndex: 9999 }}>
        {BURST_ITEMS.map((e, i) => (
          <span key={i} style={{
            position: "absolute", fontSize: 22,
            animation: `_bcb${i} 0.85s steps(4) forwards`,
            animationDelay: `${i * 0.05}s`,
          }}>{e}</span>
        ))}
      </div>
    </>
  );
}

// ─── Reusable pixel UI primitives ─────────────────────────────────────────────

function PixelBox({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "2px solid var(--border)",
      boxShadow: "3px 3px 0 #000",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "var(--font-mono)", fontSize: "6.5px",
      textTransform: "uppercase" as const, letterSpacing: "0.12em",
      color: "var(--text-muted)", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function ClockBlock({ label, value }: { label: string; value: number }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <div style={{
      background: "var(--ronin-dark)", border: "2px solid var(--border)",
      boxShadow: "2px 2px 0 #000", padding: "10px 16px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
      minWidth: 54,
    }}>
      <span style={{
        fontFamily: "var(--font-display)", fontSize: 22,
        color: "var(--ore)", textShadow: "2px 2px 0 #000", lineHeight: 1,
      }}>
        {pad(value)}
      </span>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: "5.5px",
        color: "var(--text-muted)", textTransform: "uppercase" as const,
        letterSpacing: "0.1em",
      }}>
        {label}
      </span>
    </div>
  );
}

function ProgressBar({ num, den, color }: { num: bigint; den: bigint; color: string }) {
  const p = den > 0n ? Math.min(Number((num * 10000n) / den) / 100, 100) : 0;
  return (
    <div style={{
      height: 10, background: "var(--ronin-dark)",
      border: "2px solid var(--border)", boxShadow: "inset 2px 2px 0 #000",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0,
        width: `${p}%`,
        background: `linear-gradient(90deg, ${color}66, ${color})`,
        transition: "width 0.6s ease",
      }} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 110,
      background: "var(--ronin-dark)", border: "2px solid var(--border)",
      boxShadow: "2px 2px 0 #000", padding: "10px 12px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "5.5px",
        color: "var(--text-muted)", textTransform: "uppercase" as const,
        letterSpacing: "0.1em", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: "8.5px",
        color: "var(--ore)", textShadow: "1px 1px 0 #000",
        wordBreak: "break-word" as const,
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Status panel ─────────────────────────────────────────────────────────────

const STATUS_CFG: Partial<Record<ClaimStatus, {
  icon: string; title: string; borderColor: string; bgColor: string;
}>> = {
  claimed: {
    icon: "🎉", title: "Successfully Claimed!",
    borderColor: "var(--success)", bgColor: "rgba(34,197,94,0.09)",
  },
  already_claimed: {
    icon: "🏆", title: "Already Claimed",
    borderColor: "#60a5fa", bgColor: "rgba(96,165,250,0.09)",
  },
  not_allocated: {
    icon: "❌", title: "No Allocation Found",
    borderColor: "var(--danger)", bgColor: "rgba(239,68,68,0.07)",
  },
  campaign_closed: {
    icon: "⏹", title: "Airdrop Ended",
    borderColor: "#f59e0b", bgColor: "rgba(245,158,11,0.07)",
  },
  error: {
    icon: "⚠", title: "Failed to Read Contract",
    borderColor: "var(--danger)", bgColor: "rgba(239,68,68,0.07)",
  },
};

const STATUS_BODY: Partial<Record<ClaimStatus, (alloc: bigint, err: string | null) => string>> = {
  claimed:         (a) => `${formatTokenAmount(a, 18, 4)} RONITE has been sent to your wallet.`,
  already_claimed: (a) => `${formatTokenAmount(a, 18, 4)} RONITE was already claimed previously.`,
  not_allocated:   ()  => "This wallet is not registered in the Season 1 airdrop. Make sure you have completed all tasks and are included in the snapshot.",
  campaign_closed: ()  => "Season 1 allocation has been fully distributed and the claim window is now closed. Follow announcements on Telegram for Season 2.",
  error:           (_, e) => e ?? "An error occurred. Make sure VITE_AIRDROP_CONTRACT_ADDRESS is set in your .env file.",
};

function StatusPanel({
  status, allocation, txHash, errorMsg,
}: {
  status: ClaimStatus;
  allocation: bigint;
  txHash: string | null;
  errorMsg: string | null;
}) {
  const cfg  = STATUS_CFG[status];
  const body = STATUS_BODY[status]?.(allocation, errorMsg);
  if (!cfg || !body) return null;

  return (
    <div style={{
      padding: "16px 18px",
      border: `2px solid ${cfg.borderColor}`,
      background: cfg.bgColor,
      boxShadow: "2px 2px 0 #000",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: "9px",
        color: cfg.borderColor,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 20 }}>{cfg.icon}</span>
        {cfg.title}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "6.5px",
        color: "var(--text-muted)", lineHeight: 2,
      }}>
        {body}
      </div>
      {txHash && (
        <a
          href={`${EXPLORER}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: "var(--font-mono)", fontSize: "6px",
            color: cfg.borderColor, wordBreak: "break-all" as const,
            textDecoration: "underline",
          }}
        >
          🔗 Lihat TX: {txHash.slice(0, 22)}…{txHash.slice(-8)}
        </a>
      )}
    </div>
  );
}

// ─── Allocation card ──────────────────────────────────────────────────────────

function AllocationCard({
  address, allocation, status,
}: {
  address: string;
  allocation: bigint;
  status: ClaimStatus;
}) {
  const hasAlloc  = allocation > 0n;
  const isClaimed = status === "claimed" || status === "already_claimed";

  return (
    <div style={{
      background: "var(--ronin-dark)",
      border: `2px solid ${hasAlloc ? "var(--border)" : "rgba(239,68,68,0.3)"}`,
      boxShadow: "2px 2px 0 #000", padding: "16px 18px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "5.5px",
        color: "var(--text-muted)", textTransform: "uppercase" as const,
        letterSpacing: "0.1em", marginBottom: 8,
      }}>
        Wallet Allocation
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(20px, 6vw, 32px)",
          color: hasAlloc ? "var(--ore)" : "var(--text-muted)",
          textShadow: hasAlloc ? "2px 2px 0 #000" : "none",
          lineHeight: 1,
        }}>
          {formatTokenAmount(allocation, 18, 4)}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)" }}>
          RONITE
        </span>
      </div>

      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "6px",
        color: "var(--text-muted)", wordBreak: "break-all" as const,
      }}>
        {shortenAddress(address)}
      </div>

      {isClaimed && (
        <div style={{
          marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5,
          background: "rgba(34,197,94,0.12)", border: "2px solid var(--success)",
          padding: "3px 10px", fontFamily: "var(--font-mono)", fontSize: "6px",
          color: "var(--success)", boxShadow: "1px 1px 0 #000",
        }}>
          ✅ CLAIMED
        </div>
      )}
    </div>
  );
}

// ─── Claim button ─────────────────────────────────────────────────────────────

function ClaimButton({
  status, allocation, onClick,
}: {
  status: ClaimStatus;
  allocation: bigint;
  onClick: () => void;
}) {
  const isClaiming = status === "claiming";
  return (
    <button
      onClick={onClick}
      disabled={isClaiming}
      className="btn"
      style={{
        width: "100%", padding: "18px 0",
        background: isClaiming
          ? "rgba(245,158,11,0.15)"
          : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
        border: `2px solid ${isClaiming ? "var(--border)" : "#f59e0b"}`,
        boxShadow: isClaiming ? "none" : "3px 3px 0 #000",
        color: isClaiming ? "var(--text-muted)" : "#000",
        fontFamily: "var(--font-display)", fontSize: "11px",
        letterSpacing: "0.08em", textTransform: "uppercase" as const,
        cursor: isClaiming ? "wait" : "pointer",
        transition: "all 0.12s",
      }}
    >
      {isClaiming
        ? "⏳  Waiting for Confirmation…"
        : `🪙  Claim ${formatTokenAmount(allocation, 18, 4)} RONITE`}
    </button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AirdropClaimPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [address,  setAddress]  = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [chainOk,  setChainOk]  = useState(true);

  const [data,     setData]     = useState<ContractData | null>(null);
  const [status,   setStatus]   = useState<ClaimStatus>("idle");
  const [txHash,   setTxHash]   = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [burst,    setBurst]    = useState(false);
  const burstRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Wallet connect — reuse connectWallet() dari lib/wallet.ts ─────────────

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { provider: bp, address: addr } = await connectWallet();
      // Validasi chain
      const network = await bp.getNetwork();
      if (Number(network.chainId) !== RONIN_MAINNET.chainId) {
        setChainOk(false);
        setConnecting(false);
        return;
      }
      setChainOk(true);
      setAddress(addr);
      setProvider(bp);
    } catch {
      /* user rejected */
    } finally {
      setConnecting(false);
    }
  }, []);

  // Auto-reconnect — reuse getInjectedProvider() dari lib/wallet.ts
  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected) return;
    injected
      .request({ method: "eth_accounts" })
      .then((accounts: unknown) => {
        if (Array.isArray(accounts) && accounts.length > 0) connect();
      })
      .catch(() => {});

    // Dengarkan pergantian akun / chain
    const onAccChange = (accounts: string[]) => {
      if (!accounts[0]) { setAddress(null); setProvider(null); }
      else connect();
    };
    const onChainChange = () => connect();
    (injected as any).on?.("accountsChanged", onAccChange);
    (injected as any).on?.("chainChanged",    onChainChange);
    return () => {
      (injected as any).removeListener?.("accountsChanged", onAccChange);
      (injected as any).removeListener?.("chainChanged",    onChainChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]);

  // ── Load data dari contract ────────────────────────────────────────────────

  const loadData = useCallback(async (addr: string) => {
    if (!AIRDROP_ADDR) {
      setStatus("error");
      setErrorMsg("VITE_AIRDROP_CONTRACT_ADDRESS is not set in .env");
      return;
    }
    setStatus("loading");
    setErrorMsg(null);

    const d = await fetchContractData(addr);
    if (!d) {
      setStatus("error");
      setErrorMsg("Failed to connect to the contract. Please try again in a moment.");
      return;
    }
    setData(d);

    if (d.claimed)           setStatus("already_claimed");
    else if (d.allocation === 0n) setStatus("not_allocated");
    else if (!d.isOpen || AIRDROP_ENDED) setStatus("campaign_closed");
    else                     setStatus("eligible");
  }, []);

  useEffect(() => {
    if (address && chainOk) loadData(address);
    else if (!address) {
      setStatus("idle"); setData(null);
      setTxHash(null);  setErrorMsg(null);
    }
  }, [address, chainOk, loadData]);

  // ── Countdown ─────────────────────────────────────────────────────────────
  const defaultEnd = new Date("2026-09-30T16:59:59Z").getTime();
  const endMs = data?.claimEndMs && data.claimEndMs > 0 ? data.claimEndMs : defaultEnd;
  const { d, h, m, s, expired } = useCountdown(endMs);

  // ── Claim ─────────────────────────────────────────────────────────────────

  async function handleClaim() {
    if (!address || !provider || !AIRDROP_ADDR || status !== "eligible") return;
    setStatus("claiming");
    setErrorMsg(null);
    try {
      const signer = await provider.getSigner();
      const c      = new Contract(AIRDROP_ADDR, AIRDROP_ABI, signer);
      const tx     = await c.claim();
      setTxHash(tx.hash as string);
      await tx.wait();
      setStatus("claimed");
      triggerBurst();
      // Refresh data setelah claim
      const fresh = await fetchContractData(address);
      if (fresh) setData(fresh);
    } catch (err: unknown) {
      const raw: string =
        (err as { reason?: string })?.reason ??
        ((err as { data?: { message?: string } })?.data?.message) ??
        (err instanceof Error ? err.message : "Transaksi dibatalkan.");
      setErrorMsg(raw.length > 150 ? raw.slice(0, 150) + "…" : raw);
      setStatus("eligible");
    }
  }

  function triggerBurst() {
    setBurst(true);
    if (burstRef.current) clearTimeout(burstRef.current);
    burstRef.current = setTimeout(() => setBurst(false), 950);
  }

  // ── Helpers render ────────────────────────────────────────────────────────

  const claimPctStr = data && data.totalAllocated > 0n
    ? (Number((data.totalClaimed * 10000n) / data.totalAllocated) / 100).toFixed(1)
    : "0.0";

  const canRetry =
    status === "eligible"        ||
    status === "not_allocated"   ||
    status === "campaign_closed" ||
    status === "already_claimed";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="grid-backdrop" aria-hidden="true" />
      <CoinBurst active={burst} />

      {/* ════════════════════════════════════════════════════════════════
          TOPBAR  (sama persis dengan App.tsx)
      ════════════════════════════════════════════════════════════════ */}
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* ← kembali ke Mining */}
          <button
            className="btn btn--docs"
            onClick={() => { window.location.hash = ""; }}
          >
            ← Mining
          </button>
          {/* ke halaman Tasks */}
          <button
            className="btn btn--docs"
            onClick={() => { window.location.hash = "#airdrop"; }}
          >
            📋 Tasks
          </button>

          <div className="brand">
            <span className="brand-mark" aria-hidden="true">🎁</span>
            <span className="brand-name">AIRDROP CLAIM</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "6px",
              color: "var(--text-muted)", letterSpacing: "0.06em",
              marginLeft: 4, textTransform: "uppercase" as const,
            }}>
              Season 1
            </span>
          </div>
        </div>

        <div className="topbar-right">
          {address && !chainOk && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "6px",
              color: "var(--danger)", border: "2px solid var(--danger)",
              padding: "4px 8px", boxShadow: "var(--shadow-pixel-sm)",
            }}>
              ⚠ Switch to Ronin
            </span>
          )}
          {address ? (
            <div className="wallet-chip">
              <span className="status-dot status-dot--live" aria-hidden="true" />
              <span className="mono">{shortenAddress(address)}</span>
            </div>
          ) : (
            <button
              className="btn btn--primary"
              onClick={connect}
              disabled={connecting}
            >
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════
          MAIN
      ════════════════════════════════════════════════════════════════ */}
      <main className="content" style={{ maxWidth: 520 }}>

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <PixelBox style={{ padding: "22px 20px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 42, marginBottom: 10, textShadow: "3px 3px 0 #000" }}>
            🎁
          </div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(15px,4.5vw,22px)",
            color: "var(--ore)", textShadow: "2px 2px 0 #000",
            letterSpacing: "0.1em", marginBottom: 6,
          }}>
            RONITE AIRDROP
          </div>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "6.5px",
            color: "var(--text-muted)", letterSpacing: "0.06em",
          }}>
            Season 1 · Ronin Mainnet · Chain ID {RONIN_MAINNET.chainId}
          </div>
        </PixelBox>

        {/* ── Countdown ──────────────────────────────────────────────── */}
        <PixelBox style={{ padding: "16px 18px" }}>
          <SectionLabel>
            ⏳ {AIRDROP_ENDED || expired ? "Campaign Has Ended" : "Claim Window Closes In"}
          </SectionLabel>
          <div style={{
            display: "flex", gap: 8, justifyContent: "center",
            flexWrap: "wrap" as const,
          }}>
            <ClockBlock label="Days"  value={d} />
            <ClockBlock label="Hrs"   value={h} />
            <ClockBlock label="Min"   value={m} />
            <ClockBlock label="Sec"   value={s} />
          </div>
          {data && (
            <div style={{
              marginTop: 12, fontFamily: "var(--font-mono)", fontSize: "6px",
              color: "var(--text-muted)", textAlign: "center" as const, lineHeight: 2,
            }}>
              {data.claimStartMs > 0
                ? `Opens: ${new Date(data.claimStartMs).toLocaleString("en-US")}`
                : "Campaign not yet opened by owner"}
              {data.claimEndMs > 0 && (
                <> &nbsp;·&nbsp; Closes: {new Date(data.claimEndMs).toLocaleString("en-US")}</>
              )}
            </div>
          )}
        </PixelBox>

        {/* ── Campaign stats ─────────────────────────────────────────── */}
        {data && (
          <PixelBox style={{ padding: "16px 18px" }}>
            <SectionLabel>📊 Campaign Stats</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
              <StatCard
                label="Total Allocated"
                value={`${formatTokenAmount(data.totalAllocated, 18, 0)} RONITE`}
              />
              <StatCard
                label="Total Claimed"
                value={`${formatTokenAmount(data.totalClaimed, 18, 0)} RONITE`}
              />
              <StatCard
                label="Remaining"
                value={`${formatTokenAmount(data.remaining, 18, 0)} RONITE`}
              />
            </div>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: "6px",
              color: "var(--text-muted)", marginBottom: 6,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>Claim Progress</span>
              <span>{claimPctStr}%</span>
            </div>
            <ProgressBar
              num={data.totalClaimed}
              den={data.totalAllocated}
              color="#f59e0b"
            />
          </PixelBox>
        )}

        {/* ── Claim panel ────────────────────────────────────────────── */}
        <PixelBox style={{ padding: "20px" }}>
          <SectionLabel>🪙 Claim Your Airdrop</SectionLabel>

          {/* Belum connect */}
          {!address && (
            <div style={{ textAlign: "center" as const, padding: "28px 0" }}>
              <div style={{ fontSize: 38, marginBottom: 14 }}>🔒</div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: "7px",
                color: "var(--text-muted)", marginBottom: 20, lineHeight: 2,
              }}>
                Connect your Ronin Wallet to check &amp; claim your airdrop
              </div>
              <button
                className="btn btn--primary"
                onClick={connect}
                disabled={connecting}
                style={{ fontSize: "8px", padding: "14px 28px" }}
              >
                {connecting ? "Connecting…" : "Connect Wallet"}
              </button>
            </div>
          )}

          {/* Chain salah */}
          {address && !chainOk && (
            <div style={{
              textAlign: "center" as const, padding: "20px",
              border: "2px solid var(--danger)", background: "rgba(239,68,68,0.08)",
              fontFamily: "var(--font-mono)", fontSize: "7px",
              color: "var(--danger)", lineHeight: 2,
            }}>
              ⚠ Please switch to Ronin Mainnet (Chain ID {RONIN_MAINNET.chainId})<br />
              in your wallet first
            </div>
          )}

          {/* Loading */}
          {address && chainOk && status === "loading" && (
            <div style={{ textAlign: "center" as const, padding: "28px 0" }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: "7px",
                color: "var(--text-muted)",
              }}>
                ⏳ Reading data from contract…
              </div>
              <div style={{
                marginTop: 14, height: 4,
                background: "var(--ronin-dark)", border: "2px solid var(--border)",
                overflow: "hidden", position: "relative",
              }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  width: "35%", background: "var(--ore)",
                  animation: "_ld 1.2s ease-in-out infinite",
                }} />
                <style>{`@keyframes _ld{0%{left:-35%}100%{left:100%}}`}</style>
              </div>
            </div>
          )}

          {/* Contract env belum set / gagal konek */}
          {address && chainOk && status === "error" && (
            <div style={{
              padding: "14px 16px", border: "2px solid var(--danger)",
              background: "rgba(239,68,68,0.08)", fontFamily: "var(--font-mono)",
              fontSize: "6.5px", color: "var(--danger)", lineHeight: 2,
            }}>
              ⚠ {errorMsg}
              <br />
              <button
                className="btn"
                onClick={() => address && loadData(address)}
                style={{
                  marginTop: 10, background: "transparent",
                  border: "2px solid var(--danger)", color: "var(--danger)",
                  fontFamily: "var(--font-mono)", fontSize: "6px",
                  padding: "5px 12px", cursor: "pointer",
                }}
              >
                🔄 Try Again
              </button>
            </div>
          )}

          {/* Data loaded */}
          {address && chainOk && data && status !== "loading" && status !== "error" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Alokasi */}
              <AllocationCard address={address} allocation={data.allocation} status={status} />

              {/* Error dari TX claim */}
              {errorMsg && status === "eligible" && (
                <div style={{
                  padding: "10px 14px", border: "2px solid var(--danger)",
                  background: "rgba(239,68,68,0.08)", fontFamily: "var(--font-mono)",
                  fontSize: "6.5px", color: "var(--danger)", lineHeight: 2,
                }}>
                  ⚠ {errorMsg}
                </div>
              )}

              {/* Status info panel */}
              <StatusPanel
                status={status}
                allocation={data.allocation}
                txHash={txHash}
                errorMsg={errorMsg}
              />

              {/* Tombol Claim */}
              {(status === "eligible" || status === "claiming") && (
                <ClaimButton
                  status={status}
                  allocation={data.allocation}
                  onClick={handleClaim}
                />
              )}

              {/* Link explorer setelah claim */}
              {status === "claimed" && txHash && (
                <a
                  href={`${EXPLORER}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block", textAlign: "center" as const,
                    fontFamily: "var(--font-mono)", fontSize: "6.5px",
                    color: "var(--success)", textDecoration: "underline",
                  }}
                >
                  🔗 View transaction on Ronin Explorer
                </a>
              )}

              {/* Refresh */}
              {canRetry && (
                <button
                  onClick={() => address && loadData(address)}
                  className="btn btn--docs"
                  style={{ width: "100%", fontSize: "6.5px" }}
                >
                  🔄 Refresh Status                </button>
              )}
            </div>
          )}
        </PixelBox>

        {/* ── Cara claim ─────────────────────────────────────────────── */}
        <PixelBox style={{ padding: "16px 18px", background: "var(--surface-alt)" }}>
          <SectionLabel>📖 How to Claim</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              {
                n: "1", t: "Connect Wallet",
                d: `Connect your Ronin Wallet. Make sure Ronin Mainnet (Chain ID ${RONIN_MAINNET.chainId}) is active.`,
              },
              {
                n: "2", t: "Check Allocation",
                d: "The system automatically reads your allocation from the RoniteAirdrop smart contract directly on Ronin mainnet.",
              },
              {
                n: "3", t: "Click Claim",
                d: "Press the Claim button and confirm the transaction in your wallet. No fee other than RON gas.",
              },
              {
                n: "4", t: "RONITE Received",
                d: "RONITE tokens are sent directly to your wallet on-chain. Verify on Ronin Explorer.",
              },
            ].map(step => (
              <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{
                  width: 24, height: 24, background: "var(--accent)", color: "#000",
                  fontFamily: "var(--font-display)", fontSize: "9px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, boxShadow: "2px 2px 0 #000",
                }}>
                  {step.n}
                </div>
                <div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "7px",
                    color: "var(--text)", marginBottom: 3,
                  }}>
                    {step.t}
                  </div>
                  <div style={{ fontSize: "6px", color: "var(--text-muted)", lineHeight: 2 }}>
                    {step.d}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PixelBox>

        {/* ── Contract info ───────────────────────────────────────────── */}
        <PixelBox style={{ padding: "14px 18px" }}>
          <SectionLabel>🔗 Contract Info</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              {
                label: "Airdrop Contract",
                val: AIRDROP_ADDR ?? "❌ Not set (VITE_AIRDROP_CONTRACT_ADDRESS)",
              },
              {
                label: "RONITE Token",
                val: RONITE_ADDRESS ?? "❌ Not set (VITE_RONITE_TOKEN_ADDRESS)",
              },
              {
                label: "Network",
                val: `${RONIN_MAINNET.chainName} · Chain ID ${RONIN_MAINNET.chainId}`,
              },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{
                  fontFamily: "var(--font-mono)", fontSize: "5.5px",
                  color: "var(--text-muted)", textTransform: "uppercase" as const,
                  letterSpacing: "0.1em", marginBottom: 3,
                }}>
                  {label}
                </div>
                {val.startsWith("0x") ? (
                  <a
                    href={`${EXPLORER}/address/${val}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: "6.5px",
                      color: "var(--accent)", wordBreak: "break-all" as const,
                    }}
                  >
                    {val}
                  </a>
                ) : (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: "6.5px",
                    color: val.startsWith("❌") ? "var(--danger)" : "var(--text)",
                    wordBreak: "break-all" as const,
                  }}>
                    {val}
                  </span>
                )}
              </div>
            ))}
          </div>
        </PixelBox>

        {/* ── Rules ──────────────────────────────────────────────────── */}
        <PixelBox style={{ padding: "14px 18px" }}>
          <SectionLabel>⚖ Terms &amp; Conditions</SectionLabel>
          <ul style={{
            margin: 0, padding: "0 0 0 14px",
            display: "flex", flexDirection: "column", gap: 7,
          }}>
            {[
              "One claim per wallet. Wallets that have already claimed cannot claim again.",
              "Allocation is determined from the on-chain snapshot after Season 1 ends.",
              "Claiming is only available during the active campaign window.",
              "Airdrop is distributed in RONITE on Ronin Mainnet (Chain ID 2020).",
              "Unclaimed tokens after the deadline will be swept by the owner.",
              "The team reserves the right to modify or cancel the campaign at any time.",
            ].map((r, i) => (
              <li key={i} style={{ fontSize: "6.5px", color: "var(--text-muted)", lineHeight: 2 }}>
                {r}
              </li>
            ))}
          </ul>
        </PixelBox>

      </main>

      <footer className="footer">
        Copyright Ronite 2026 · Airdrop Season 1 · Built on Ronin Mainnet · Chain ID {RONIN_MAINNET.chainId}
      </footer>
    </div>
  );
}

export default AirdropClaimPage;
