/**
 * VestingPage.tsx — Halaman Vesting RONITE
 *
 * Features:
 *  - Lihat semua vesting schedule milik wallet yang connect
 *  - Progress bar linear vesting per schedule
 *  - Claim individual atau Claim All
 *  - Admin panel: tambah schedule baru (jika wallet = owner)
 *  - Countdown cliff & end date
 *
 * Navigasi: window.location.hash = "#vesting"
 * Tambahkan di Router.tsx:
 *   import { VestingPage } from "./Vesting";
 *   if (page === "vesting") return <VestingPage />;
 *   Dan tombol di bagian fixed buttons.
 */

import React, {
  useState, useEffect, useCallback, useRef,
} from "react";
import {
  BrowserProvider, Contract, JsonRpcProvider,
  formatUnits, parseUnits, MaxUint256,
} from "ethers";

// ─── Config ──────────────────────────────────────────────────────────────────

const RONIN_RPC = "https://ronin.drpc.org";
const CHAIN_ID  = 2020;

const VESTING_ADDRESS = import.meta.env.VITE_VESTING_CONTRACT_ADDRESS as string | undefined;
const RONITE_ADDRESS  = import.meta.env.VITE_RONITE_TOKEN_ADDRESS      as string | undefined;

const VESTING_ABI = [
  // views
  "function scheduleCount() view returns (uint256)",
  "function schedulesOf(address user) view returns (uint256[])",
  "function schedules(uint256 id) view returns (address beneficiary, uint128 total, uint128 released, uint64 start, uint64 cliff, uint64 duration, bool revoked)",
  "function vestedAmount(uint256 id, uint64 timestamp) view returns (uint128)",
  "function claimable(uint256 id) view returns (uint128)",
  "function totalClaimable(address user) view returns (uint128)",
  "function owner() view returns (address)",
  // user
  "function claim(uint256 id)",
  "function claimAll()",
  // owner
  "function addSchedule(address beneficiary, uint128 amount, uint64 start, uint64 cliff, uint64 duration) returns (uint256)",
  "function revokeSchedule(uint256 id)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];

const readProvider = new JsonRpcProvider(
  RONIN_RPC,
  { chainId: CHAIN_ID, name: "ronin" },
  { staticNetwork: true, batchMaxCount: 1 },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawSchedule {
  beneficiary: string;
  total:       bigint;
  released:    bigint;
  start:       bigint;
  cliff:       bigint;
  duration:    bigint;
  revoked:     boolean;
}

interface ScheduleView extends RawSchedule {
  id:          number;
  vestedNow:   bigint;
  claimableNow: bigint;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: bigint, dec = 18, digits = 4) {
  const n = Number(formatUnits(val, dec));
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtDate(ts: bigint) {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return "Unlocked";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function progressPct(s: ScheduleView, nowTs: number): number {
  const start    = Number(s.start);
  const duration = Number(s.duration);
  if (duration === 0) return 100;
  const elapsed = Math.max(0, nowTs - start);
  return Math.min(100, (elapsed / duration) * 100);
}

// ─── Schedule Card ────────────────────────────────────────────────────────────

function ScheduleCard({
  s, nowTs, isOwner, pendingId, connectedAddress,
  onClaim, onRevoke,
}: {
  s: ScheduleView;
  nowTs: number;
  isOwner: boolean;
  pendingId: number | null;
  connectedAddress: string | null;
  onClaim:  (id: number) => void;
  onRevoke: (id: number) => void;
}) {
  const pct       = progressPct(s, nowTs);
  const cliffSecs = Math.max(0, Number(s.cliff) - nowTs);
  const endSecs   = Math.max(0, Number(s.start) + Number(s.duration) - nowTs);
  const isLoading = pendingId === s.id;
  const totalFmt  = fmt(s.total);
  const relFmt    = fmt(s.released);
  const claimFmt  = fmt(s.claimableNow);
  const vestedFmt = fmt(s.vestedNow);
  const isMine    = connectedAddress?.toLowerCase() === s.beneficiary?.toLowerCase();

  return (
    <div className="pool-card" style={{
      "--pool-color": s.revoked ? "#ef4444" : "#a855f7",
    } as React.CSSProperties}>
      <div className="pool-header">
        <div>
          <span className="pool-rarity" style={{ color: s.revoked ? "#ef4444" : "#a855f7" }}>
            {s.revoked ? "🔴 Revoked" : pct >= 100 ? "✅ Fully Vested" : "🔒 Vesting"}
          </span>
          <h2 className="pool-name" style={{ fontSize: 9 }}>Schedule #{s.id}</h2>
        </div>
        <div className="pool-live-reward">
          <span className="pool-live-label">Claimable</span>
          <span className="pool-live-number mono" style={{ color: "#a855f7" }}>
            {claimFmt}
          </span>
          <span className="pool-live-sym">RONITE</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ margin: "10px 0 6px" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 7, color: "var(--text-muted)", marginBottom: 4,
        }}>
          <span>Vesting Progress</span>
          <span className="mono">{pct.toFixed(1)}%</span>
        </div>
        <div style={{
          background: "var(--border)", height: 8,
          boxShadow: "var(--shadow-pixel-sm)", position: "relative",
        }}>
          <div style={{
            width: `${pct}%`, height: "100%",
            background: s.revoked
              ? "#ef4444"
              : pct >= 100 ? "#22c55e" : "#a855f7",
            transition: "width 0.4s",
          }} />
        </div>
      </div>

      <dl className="stat-list">
        <div className="stat-row">
          <dt>Beneficiary</dt>
          <dd className="mono" style={{ color: isMine ? "#a855f7" : "var(--text-muted)", fontSize: 7 }}>
            {s.beneficiary.slice(0, 8)}…{s.beneficiary.slice(-6)}
            {isMine && <span style={{ color: "#22c55e", marginLeft: 6 }}>← you</span>}
          </dd>
        </div>
        <div className="stat-row">
          <dt>Total Allocated</dt>
          <dd className="mono">{totalFmt} RONITE</dd>
        </div>
        <div className="stat-row">
          <dt>Vested So Far</dt>
          <dd className="mono">{vestedFmt} RONITE</dd>
        </div>
        <div className="stat-row">
          <dt>Released</dt>
          <dd className="mono">{relFmt} RONITE</dd>
        </div>
        <div className="stat-row">
          <dt>Cliff</dt>
          <dd className="mono" style={{ color: cliffSecs > 0 ? "#f59e0b" : "#22c55e" }}>
            {cliffSecs > 0 ? `⏳ ${formatCountdown(cliffSecs)}` : `✓ ${fmtDate(s.cliff)}`}
          </dd>
        </div>
        <div className="stat-row">
          <dt>Vest End</dt>
          <dd className="mono" style={{ color: endSecs > 0 ? "var(--text-muted)" : "#22c55e" }}>
            {endSecs > 0 ? `${fmtDate(s.start + s.duration)} (${formatCountdown(endSecs)})` : `✓ ${fmtDate(s.start + s.duration)}`}
          </dd>
        </div>
        <div className="stat-row">
          <dt>Start</dt>
          <dd className="mono">{fmtDate(s.start)}</dd>
        </div>
      </dl>

      <div className="claim-row" style={{ marginTop: 12 }}>
        <span className="claim-pending mono">
          {claimFmt} RONITE available
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {isMine ? (
            <button
              className="btn btn--primary"
              onClick={() => onClaim(s.id)}
              disabled={s.claimableNow === 0n || s.revoked || isLoading}
            >
              {isLoading ? "Claiming…" : "Claim"}
            </button>
          ) : (
            <span style={{ fontSize: 7, color: "var(--text-muted)", alignSelf: "center" }}>
              🔒 Not yours
            </span>
          )}
          {isOwner && !s.revoked && (
            <button
              className="btn"
              style={{ color: "#ef4444", borderColor: "#ef4444" }}
              onClick={() => onRevoke(s.id)}
              disabled={isLoading}
            >
              Revoke
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Schedule Form (Owner only) ──────────────────────────────────────────

function AddScheduleForm({
  roniteBalance,
  roniteAllowance,
  pending,
  onApprove,
  onAdd,
}: {
  roniteBalance: bigint;
  roniteAllowance: bigint;
  pending: boolean;
  onApprove: () => void;
  onAdd: (
    beneficiary: string,
    amount: string,
    startDate: string,
    cliffDate: string,
    endDate: string,
  ) => void;
}) {
  const [beneficiary, setBeneficiary] = useState("");
  const [amount,      setAmount]      = useState("");
  const [startDate,   setStartDate]   = useState("");
  const [cliffDate,   setCliffDate]   = useState("");
  const [endDate,     setEndDate]     = useState("");
  const [open,        setOpen]        = useState(false);

  const amtWei    = amount ? parseUnits(amount, 18) : 0n;
  const needsAppr = amtWei > 0n && roniteAllowance < amtWei;

  return (
    <div className="pool-card" style={{ "--pool-color": "#f59e0b" } as React.CSSProperties}>
      <div className="pool-header">
        <div>
          <span className="pool-rarity" style={{ color: "#f59e0b" }}>👑 Owner Panel</span>
          <h2 className="pool-name" style={{ fontSize: 9 }}>Add Vesting Schedule</h2>
        </div>
        <button
          className="btn"
          onClick={() => setOpen(v => !v)}
          style={{ fontSize: 7 }}
        >
          {open ? "▼ Hide" : "▶ Open"}
        </button>
      </div>

      {open && (
        <div className="pool-actions" style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <label className="buy-label">Beneficiary Address</label>
            <input
              className="input"
              placeholder="0x..."
              value={beneficiary}
              onChange={e => setBeneficiary(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label className="buy-label">Amount (RONITE)</label>
            <div className="input-with-max">
              <input
                className="input"
                inputMode="decimal"
                placeholder="e.g. 1000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              <button
                className="btn btn--max"
                onClick={() => setAmount(formatUnits(roniteBalance, 18))}
                disabled={roniteBalance === 0n}
              >MAX</button>
            </div>
            <div style={{ fontSize: 7, color: "var(--text-muted)", marginTop: 4 }}>
              Your balance: {fmt(roniteBalance)} RONITE
            </div>
          </div>

          <div className="field-row" style={{ gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label className="buy-label">Start Date</label>
              <input
                className="input"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="buy-label">Cliff Date</label>
              <input
                className="input"
                type="date"
                value={cliffDate}
                onChange={e => setCliffDate(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="buy-label">End Date</label>
              <input
                className="input"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ fontSize: 7, color: "var(--text-muted)", marginBottom: 10, lineHeight: 2 }}>
            ℹ️ Cliff = nothing claimable before cliff date.<br />
            Linear vesting runs from Start to End.
          </div>

          {needsAppr ? (
            <button
              className="btn btn--accent btn--wide"
              onClick={onApprove}
              disabled={pending}
            >
              {pending ? "Approving…" : "Approve RONITE (step 1/2)"}
            </button>
          ) : (
            <button
              className="btn btn--primary btn--wide"
              onClick={() => onAdd(beneficiary, amount, startDate, cliffDate, endDate)}
              disabled={pending || !beneficiary || !amount || !startDate || !endDate}
            >
              {pending ? "Adding Schedule…" : "Add Schedule (step 2/2)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function VestingPage() {
  const [address,    setAddress]    = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [schedules,  setSchedules]  = useState<ScheduleView[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [toast,      setToast]      = useState<string | null>(null);
  const [pendingId,  setPendingId]  = useState<number | null>(null);
  const [pendingOp,  setPendingOp]  = useState(false);
  const [isOwner,    setIsOwner]    = useState(false);
  const [contractOwner, setContractOwner] = useState<string>("");
  const [roniteBalance, setRoniteBalance] = useState(0n);
  const [roniteAllowance, setRoniteAllowance] = useState(0n);
  const [nowTs, setNowTs] = useState(Math.floor(Date.now() / 1000));

  const providerRef = useRef<BrowserProvider | null>(null);

  // Tick clock every 10s for countdown accuracy
  useEffect(() => {
    const t = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(t);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // ── Connect wallet ────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const injected = (window as any).ronin?.provider ?? (window as any).ethereum;
      if (!injected) throw new Error("No wallet found. Install Ronin Wallet.");
      await injected.request({ method: "eth_requestAccounts" });
      try {
        await injected.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x7e4" }],
        });
      } catch (e: any) {
        if (e?.code === 4902) {
          await injected.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x7e4",
              chainName: "Ronin",
              nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
              rpcUrls: ["https://ronin.drpc.org"],
              blockExplorerUrls: ["https://explorer.roninchain.com"],
            }],
          });
        }
      }
      const bp = new BrowserProvider(injected);
      providerRef.current = bp;
      const signer = await bp.getSigner();
      const addr   = await signer.getAddress();
      setAddress(addr);
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Load schedules ────────────────────────────────────────────────────────

  const loadSchedules = useCallback(async (addr: string) => {
    if (!VESTING_ADDRESS) return;
    setLoading(true);
    try {
      const c = new Contract(VESTING_ADDRESS, VESTING_ABI, readProvider);

      // Fetch ALL schedules publicly by iterating scheduleCount
      const count: bigint = await c.scheduleCount();
      const allIds = Array.from({ length: Number(count) }, (_, i) => BigInt(i));

      const now = BigInt(Math.floor(Date.now() / 1000));
      const views: ScheduleView[] = await Promise.all(
        allIds.map(async (id) => {
          const raw = await c.schedules(id);
          const vestedNow    = await c.vestedAmount(id, now);
          const claimableNow = await c.claimable(id);
          return {
            id:            Number(id),
            beneficiary:   raw.beneficiary,
            total:         raw.total,
            released:      raw.released,
            start:         raw.start,
            cliff:         raw.cliff,
            duration:      raw.duration,
            revoked:       raw.revoked,
            vestedNow,
            claimableNow,
          };
        })
      );
      setSchedules(views);

      // Owner check
      const ownerAddr: string = await c.owner();
      setContractOwner(ownerAddr);
      setIsOwner(ownerAddr.toLowerCase() === addr.toLowerCase());

      // Ronite balance + allowance for owner
      if (RONITE_ADDRESS) {
        const erc20 = new Contract(RONITE_ADDRESS, ERC20_ABI, readProvider);
        const [bal, allow] = await Promise.all([
          erc20.balanceOf(addr),
          erc20.allowance(addr, VESTING_ADDRESS),
        ]);
        setRoniteBalance(bal);
        setRoniteAllowance(allow);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (address) loadSchedules(address);
  }, [address, loadSchedules]);

  // ── Claim ─────────────────────────────────────────────────────────────────

  async function handleClaim(id: number) {
    if (!providerRef.current || !address || !VESTING_ADDRESS) return;
    setPendingId(id);
    try {
      const signer  = await providerRef.current.getSigner();
      const c       = new Contract(VESTING_ADDRESS, VESTING_ABI, signer);
      const tx      = await c.claim(id);
      await tx.wait();
      showToast("✅ Claimed successfully!");
      await loadSchedules(address);
    } catch (e: any) {
      setError(e?.message ?? "Claim failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handleClaimAll() {
    if (!providerRef.current || !address || !VESTING_ADDRESS) return;
    setPendingOp(true);
    try {
      const signer = await providerRef.current.getSigner();
      const c      = new Contract(VESTING_ADDRESS, VESTING_ABI, signer);
      const tx     = await c.claimAll();
      await tx.wait();
      showToast("✅ All rewards claimed!");
      await loadSchedules(address);
    } catch (e: any) {
      setError(e?.message ?? "Claim all failed");
    } finally {
      setPendingOp(false);
    }
  }

  // ── Revoke ────────────────────────────────────────────────────────────────

  async function handleRevoke(id: number) {
    if (!providerRef.current || !address || !VESTING_ADDRESS) return;
    if (!window.confirm(`Revoke schedule #${id}? Unvested tokens will return to treasury.`)) return;
    setPendingId(id);
    try {
      const signer = await providerRef.current.getSigner();
      const c      = new Contract(VESTING_ADDRESS, VESTING_ABI, signer);
      const tx     = await c.revokeSchedule(id);
      await tx.wait();
      showToast("⚠️ Schedule revoked.");
      await loadSchedules(address);
    } catch (e: any) {
      setError(e?.message ?? "Revoke failed");
    } finally {
      setPendingId(null);
    }
  }

  // ── Approve RONITE for vesting contract ───────────────────────────────────

  async function handleApproveRonite() {
    if (!providerRef.current || !RONITE_ADDRESS || !VESTING_ADDRESS) return;
    setPendingOp(true);
    try {
      const signer = await providerRef.current.getSigner();
      const erc20  = new Contract(RONITE_ADDRESS, ERC20_ABI, signer);
      const tx     = await erc20.approve(VESTING_ADDRESS, MaxUint256);
      await tx.wait();
      setRoniteAllowance(MaxUint256);
      showToast("✅ Approved! Now add the schedule.");
    } catch (e: any) {
      setError(e?.message ?? "Approve failed");
    } finally {
      setPendingOp(false);
    }
  }

  // ── Add schedule ──────────────────────────────────────────────────────────

  async function handleAddSchedule(
    beneficiary: string,
    amount: string,
    startDate: string,
    cliffDate: string,
    endDate: string,
  ) {
    if (!providerRef.current || !VESTING_ADDRESS) return;
    setPendingOp(true);
    setError(null);
    try {
      const startTs = BigInt(Math.floor(new Date(startDate).getTime() / 1000));
      const cliffTs = BigInt(Math.floor(new Date(cliffDate).getTime() / 1000));
      const endTs   = BigInt(Math.floor(new Date(endDate).getTime() / 1000));
      const duration = endTs - startTs;
      if (duration <= 0n) throw new Error("End date must be after start date");
      if (cliffTs < startTs) throw new Error("Cliff must be ≥ start date");

      const amtWei = parseUnits(amount, 18);
      const signer = await providerRef.current.getSigner();
      const c      = new Contract(VESTING_ADDRESS, VESTING_ABI, signer);
      const tx     = await c.addSchedule(beneficiary, amtWei, startTs, cliffTs, duration);
      await tx.wait();
      showToast("✅ Vesting schedule added!");
      if (address) await loadSchedules(address);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add schedule");
    } finally {
      setPendingOp(false);
    }
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

  const mySchedules    = schedules.filter(s => s.beneficiary?.toLowerCase() === address?.toLowerCase());
  const totalClaimable = mySchedules.reduce((s, sc) => s + sc.claimableNow, 0n);
  const totalAllocated = schedules.reduce((s, sc) => s + sc.total, 0n);
  const totalReleased  = schedules.reduce((s, sc) => s + sc.released, 0n);
  const activeCount    = schedules.filter(s => !s.revoked).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="grid-backdrop" aria-hidden="true" />

      {/* Header */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🔒</span>
          <span className="brand-name">RONITE VESTING</span>
        </div>
        <div className="topbar-right">
          <button
            className="btn"
            style={{ fontSize: 7 }}
            onClick={() => { window.location.hash = ""; }}
          >
            ← Back
          </button>
          {address ? (
            <div className="wallet-chip">
              <span className="status-dot status-dot--live" />
              <span className="mono">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
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

      <main className="content">

        {/* Contract not configured */}
        {!VESTING_ADDRESS && (
          <div style={{
            textAlign: "center", padding: "40px 20px",
            color: "var(--text-muted)", fontSize: 8, lineHeight: 2.5,
          }}>
            ⚠️ Vesting contract not configured.<br />
            Add <code>VITE_VESTING_CONTRACT_ADDRESS</code> to your <code>.env</code> file.
          </div>
        )}

        {VESTING_ADDRESS && !address && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <p style={{ color: "var(--text-muted)", fontSize: 8, marginBottom: 16 }}>
              🔒 Connect your wallet to view vesting schedules
            </p>
            <button className="btn btn--primary" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          </div>
        )}

        {VESTING_ADDRESS && address && (
          <>
            {/* Summary bar — global stats */}
            <section className="supply-bar-section">
              <div className="supply-bar-header">
                <span className="supply-bar-label">🔒 All Vesting Schedules</span>
                <span className="supply-bar-nums mono">
                  <span style={{ color: "#a855f7" }}>{activeCount} active</span>
                  <span className="supply-sep"> · </span>
                  <span>{schedules.length} total</span>
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                {[
                  { label: "Total Allocated (all)", value: `${fmt(totalAllocated)} RONITE`, color: "var(--text)" },
                  { label: "Total Released (all)",  value: `${fmt(totalReleased)} RONITE`,  color: "#22c55e" },
                  { label: "My Claimable",          value: `${fmt(totalClaimable)} RONITE`, color: "#a855f7" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{
                    background: "var(--surface-alt)",
                    border: "1px solid var(--border)",
                    padding: "8px 12px", flex: 1, minWidth: 120,
                  }}>
                    <div style={{ fontSize: 7, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
                    <div className="mono" style={{ fontSize: 8, color }}>{value}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Claim All bar — only if wallet has claimable */}
            {totalClaimable > 0n && (
              <section className="claim-all-bar">
                <span>🔓 {fmt(totalClaimable)} RONITE claimable in your schedules</span>
                <button
                  className="btn btn--primary"
                  onClick={handleClaimAll}
                  disabled={pendingOp}
                >
                  {pendingOp ? "Claiming…" : "Claim All"}
                </button>
              </section>
            )}

            {/* Owner panel */}
            {isOwner && (
              <section className="pools-grid" style={{ marginBottom: 0 }}>
                <AddScheduleForm
                  roniteBalance={roniteBalance}
                  roniteAllowance={roniteAllowance}
                  pending={pendingOp}
                  onApprove={handleApproveRonite}
                  onAdd={handleAddSchedule}
                />
              </section>
            )}

            {/* Contract info */}
            <div style={{
              fontSize: 7, color: "var(--text-muted)",
              padding: "6px 0 10px", display: "flex", gap: 12, flexWrap: "wrap",
            }}>
              <span>Contract:&nbsp;
                <a
                  className="mono"
                  style={{ color: "var(--ronin-sky)" }}
                  href={`https://explorer.roninchain.com/address/${VESTING_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {VESTING_ADDRESS.slice(0, 8)}…{VESTING_ADDRESS.slice(-6)}
                </a>
              </span>
              {contractOwner && (
                <span>Owner: <span className="mono">{contractOwner.slice(0, 6)}…{contractOwner.slice(-4)}</span></span>
              )}
            </div>

            {/* Schedules */}
            {loading ? (
              <p style={{ color: "var(--text-muted)", fontSize: 8, textAlign: "center", padding: 32 }}>
                Loading schedules…
              </p>
            ) : schedules.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "40px 20px",
                color: "var(--text-muted)", fontSize: 8, lineHeight: 2.5,
              }}>
                📭 No vesting schedules have been created yet.
              </div>
            ) : (
              <section className="pools-grid">
                {schedules.map(s => (
                  <ScheduleCard
                    key={s.id}
                    s={s}
                    nowTs={nowTs}
                    isOwner={isOwner}
                    pendingId={pendingId}
                    connectedAddress={address}
                    onClaim={handleClaim}
                    onRevoke={handleRevoke}
                  />
                ))}
              </section>
            )}
          </>
        )}

        {/* Error banner */}
        {error && (
          <div style={{
            background: "rgba(239,68,68,0.1)",
            border: "2px solid #ef4444",
            padding: "10px 14px",
            marginTop: 16, fontSize: 7, color: "#ef4444",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>⚠️ {error.length > 140 ? error.slice(0, 140) + "…" : error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: "none", border: "none",
                color: "#ef4444", cursor: "pointer", fontSize: 10,
              }}
            >✕</button>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 110, right: 20,
          background: "var(--surface)", border: "2px solid #22c55e",
          color: "#22c55e", padding: "10px 14px",
          fontFamily: "var(--font-mono)", fontSize: 7,
          boxShadow: "var(--shadow-pixel)", zIndex: 2000,
        }}>
          {toast}
        </div>
      )}

      <footer className="footer">
        Copyright Ronite 2026 · Vesting Contract · Ronin mainnet · chain id 2020
      </footer>
    </div>
  );
}