/**
 * AirdropPage.tsx — Halaman Airdrop Campaign
 *
 * Verifikasi on-chain NYATA:
 *   - buy      : balanceOf(RONITE) > 0
 *   - s_coal/iron/gold/diamond : stakedBalance(addr, pool) > 0
 *   - claim    : oreBalance(wallet) > 0 di salah satu pool
 *   - sell     : roniteBalance naik setelah konfirmasi (proxy: cek oreBalance vs cached)
 *
 * Navigasi via hash: window.location.hash = "#airdrop" / ""
 */

import React, {
  useState, useEffect, useRef, useCallback,
} from "react";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

// ─── On-chain config (mirror dari chain.ts / abi.ts) ─────────────────────────

const RONIN_RPC   = "https://ronin.drpc.org";
const CHAIN_ID    = 2020;

// Ambil dari env — boleh undefined (pool tidak aktif)
const RONITE_ADDR          = import.meta.env.VITE_RONITE_TOKEN_ADDRESS          as string | undefined;
const COAL_STAKING_ADDR    = import.meta.env.VITE_COAL_STAKING_ADDRESS          as string | undefined;
const IRON_STAKING_ADDR    = import.meta.env.VITE_IRON_STAKING_ADDRESS          as string | undefined;
const GOLD_STAKING_ADDR    = import.meta.env.VITE_GOLD_STAKING_ADDRESS          as string | undefined;
const DIAMOND_STAKING_ADDR = import.meta.env.VITE_DIAMOND_STAKING_ADDRESS       as string | undefined;

const COAL_REWARD_ADDR     = import.meta.env.VITE_COAL_REWARD_TOKEN_ADDRESS     as string | undefined;
const IRON_REWARD_ADDR     = import.meta.env.VITE_IRON_REWARD_TOKEN_ADDRESS     as string | undefined;
const GOLD_REWARD_ADDR     = import.meta.env.VITE_GOLD_REWARD_TOKEN_ADDRESS     as string | undefined;
const DIAMOND_REWARD_ADDR  = import.meta.env.VITE_DIAMOND_REWARD_TOKEN_ADDRESS  as string | undefined;
const AIRDROP_CONTRACT_ADDR = import.meta.env.VITE_AIRDROP_CONTRACT_ADDRESS       as string | undefined;

const AIRDROP_ABI = [
  // user
  "function submitForAirdrop(uint256 earned, string calldata tier, string calldata taskIds) external payable",
  "function claim() external",
  // views
  "function allocation(address) view returns (uint256)",
  "function claimed(address) view returns (bool)",
  "function isCampaignOpen() view returns (bool)",
  "function claimStart() view returns (uint256)",
  "function claimEnd() view returns (uint256)",
  "function getSubmission(address wallet) view returns (bool exists, uint256 earned, string tier, string taskIds, uint256 submittedAt)",
  "function SUBMIT_FEE() view returns (uint256)",
  "function submitterCount() view returns (uint256)",
  "function totalAllocated() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function remainingBalance() view returns (uint256)",
];

const SUBMIT_FEE_RON = "0.01"; // RON

const ERC20_ABI_MIN = [
  "function balanceOf(address) view returns (uint256)",
];
const STAKING_ABI_MIN = [
  "function stakedBalance(address) view returns (uint256)",
  "function earned(address) view returns (uint256)",
];

const readProvider = new JsonRpcProvider(
  RONIN_RPC,
  { chainId: CHAIN_ID, name: "ronin" },
  { staticNetwork: true, batchMaxCount: 1 },
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = "social" | "onchain" | "referral";

interface Task {
  id: string;
  icon: string;
  title: string;
  desc: string;
  reward: number;
  category: Category;
  href?: string;
  /** Type of proof required before submission */
  proofType: "none" | "username" | "txhash" | "wallet";
  proofLabel?: string;
  proofPattern?: RegExp;
  /** null = not yet verified, true = passed, false = failed */
  verifying: boolean;
  completed: boolean;
}

interface TierDef {
  name: string;
  icon: string;
  color: string;
  min: number;
  label: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_REWARD = 2_000_000; // total pool Season 1 (RONITE)

const TIERS: TierDef[] = [
  { name: "Pebble",      icon: "🪨", color: "#94a3b8", min: 0,  label: "0 – 9"   },
  { name: "Digger",      icon: "⛏",  color: "#a855f7", min: 10, label: "10 – 19" },
  { name: "Forger",      icon: "🔥",  color: "#f59e0b", min: 20, label: "20 – 34" },
  { name: "Vaultkeeper", icon: "💎",  color: "#60a5fa", min: 35, label: "35+"     },
];

const INITIAL_TASKS: Omit<Task, "verifying" | "completed">[] = [
  // Social — username proof required
  {
    id: "tw_follow", icon: "🐦", title: "Follow on X",
    desc: "Follow @RoniteProtocol on X. Enter your X username as proof — admin will verify manually within 48 hours.",
    reward: 1, category: "social", href: "https://x.com/RoniteProtocol",
    proofType: "username", proofLabel: "@your_twitter_username",
    proofPattern: /^@?[A-Za-z0-9_]{1,15}$/,
  },
  {
    id: "tw_rt", icon: "🔁", title: "Retweet Airdrop Post",
    desc: "Retweet the pinned airdrop post. Enter your X username as proof — admin will verify within 48 hours.",
    reward: 2, category: "social", href: "https://x.com/RoniteProtocol",
    proofType: "username", proofLabel: "@your_twitter_retweet",
    proofPattern: /^@?[A-Za-z0-9_]{1,15}$/,
  },
  {
    id: "tg_join", icon: "✈️", title: "Join Telegram",
    desc: "Join the official RONITE Telegram group. Enter your Telegram username as proof.",
    reward: 1, category: "social", href: "https://t.me/ronite_mine",
    proofType: "username", proofLabel: "@your_telegram_username",
    proofPattern: /^@?[A-Za-z0-9_]{5,32}$/,
  },
  // On-chain — verified directly from the contract
  { id: "buy",       icon: "💰", title: "Buy RONITE",            desc: "Hold at least 1 RONITE in your wallet. Verified automatically from the contract.",                   reward: 3, category: "onchain", proofType: "none" },
  { id: "s_coal",    icon: "⬜", title: "Stake — Coal Mine",     desc: "Stake any amount of RONITE in Coal Mine. Verified automatically from the staking contract.",                      reward: 2, category: "onchain", proofType: "none" },
  { id: "s_iron",    icon: "🟦", title: "Stake — Iron Forge",    desc: "Stake any amount of RONITE in Iron Forge. Verified automatically from the staking contract.",                     reward: 3, category: "onchain", proofType: "none" },
  { id: "s_gold",    icon: "🟨", title: "Stake — Gold Rush",     desc: "Stake any amount of RONITE in Gold Rush. Verified automatically from the staking contract.",                      reward: 4, category: "onchain", proofType: "none" },
  { id: "s_diamond", icon: "💎", title: "Stake — Diamond Vault", desc: "Stake any amount of RONITE in Diamond Vault. Verified automatically from the staking contract.",                  reward: 5, category: "onchain", proofType: "none" },
  { id: "claim",     icon: "🏆", title: "Claim First Reward",    desc: "Hold any ore token in your wallet (COAL/IRON/GOLD/DIAMOND). Verified automatically from the contract.",      reward: 2, category: "onchain", proofType: "none" },
  {
    id: "sell", icon: "🔨", title: "Sell Ore on Market",
    desc: "Sell ore via the ore market. Paste the sell transaction hash as proof — admin will verify on Ronin Explorer.",
    reward: 2, category: "onchain", proofType: "txhash",
    proofLabel: "0x... (sell transaction hash)",
    proofPattern: /^0x[0-9a-fA-F]{64}$/,
  },
  // Referral — 1 RONITE reward per task
  {
    id: "ref1", icon: "👥", title: "Refer 1 Friend",
    desc: "Your friend must stake at least 10 RONITE. Enter their wallet address as proof.",
    reward: 1, category: "referral", proofType: "wallet",
    proofLabel: "0x... (friend's wallet address)",
    proofPattern: /^0x[0-9a-fA-F]{40}$/,
  },
  {
    id: "ref5", icon: "🫂", title: "Refer 5 Friends",
    desc: "5 friends must each stake at least 10 RONITE. Enter all 5 wallet addresses separated by commas.",
    reward: 1, category: "referral", proofType: "wallet",
    proofLabel: "0xABC..., 0xDEF..., 0xGHI..., 0xJKL..., 0xMNO...",
  },
];

// Task IDs that can be verified on-chain automatically
const ONCHAIN_VERIFIABLE = new Set(["buy","s_coal","s_iron","s_gold","s_diamond","claim"]);

const CAT_LABELS: Record<Category, string> = {
  social:   "📡 Social",
  onchain:  "⛏ On-Chain",
  referral: "👥 Referral",
};

// ─── Persistence ─────────────────────────────────────────────────────────────

const LS_KEY = "ronite_airdrop_v2";

function loadTasks(): Task[] {
  try {
    const saved = localStorage.getItem(LS_KEY);
    const completedIds: string[] = saved ? JSON.parse(saved) : [];
    return INITIAL_TASKS.map(t => ({
      ...t,
      verifying: false,
      completed: completedIds.includes(t.id),
    }));
  } catch {
    return INITIAL_TASKS.map(t => ({
      ...t,
      verifying: false,
      completed: false,
    }));
  }
}

function persistTasks(tasks: Task[]) {
  const ids = tasks.filter(t => t.completed).map(t => t.id);
  try { localStorage.setItem(LS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

// ─── Wallet hook ──────────────────────────────────────────────────────────────

function useWallet() {
  const [address,    setAddress]    = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [chainOk,    setChainOk]    = useState(true);

  const getInjected = () =>
    (window as any).ronin?.provider ?? (window as any).ethereum ?? null;

  const connect = useCallback(async () => {
    const injected = getInjected();
    if (!injected) { alert("Install Ronin Wallet to continue."); return; }
    setConnecting(true);
    try {
      await injected.request({ method: "eth_requestAccounts" });
      // Switch / add Ronin mainnet
      try {
        await injected.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x7e4" }],
        });
      } catch (err: any) {
        if (err?.code === 4902) {
          await injected.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x7e4", chainName: "Ronin",
              nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
              rpcUrls: [RONIN_RPC],
              blockExplorerUrls: ["https://explorer.roninchain.com"],
            }],
          });
        }
      }
      const provider = new BrowserProvider(injected);
      const network  = await provider.getNetwork();
      setChainOk(Number(network.chainId) === CHAIN_ID);
      const signer = await provider.getSigner();
      setAddress(await signer.getAddress());
    } catch { /* user rejected */ } finally { setConnecting(false); }
  }, []);

  // Auto-reconnect
  useEffect(() => {
    const injected = getInjected();
    if (!injected) return;
    injected.request({ method: "eth_accounts" })
      .then((accounts: string[]) => { if (accounts[0]) connect(); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { address, connecting, chainOk, connect };
}

// ─── Airdrop contract hook ────────────────────────────────────────────────────

interface AirdropStatus {
  allocation: bigint;
  claimed: boolean;
  campaignOpen: boolean;
  // submission
  submitted: boolean;
  submittedEarned: number;
  submittedTier: string;
  submittedAt: number; // unix seconds
  loading: boolean;
  error: string | null;
}

function useAirdropStatus(address: string | null, refreshKey = 0): AirdropStatus {
  const [status, setStatus] = useState<AirdropStatus>({
    allocation: 0n,
    claimed: false,
    campaignOpen: false,
    submitted: false,
    submittedEarned: 0,
    submittedTier: "",
    submittedAt: 0,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!AIRDROP_CONTRACT_ADDR || !address) return;
    setStatus(s => ({ ...s, loading: true, error: null }));
    try {
      const c = new Contract(AIRDROP_CONTRACT_ADDR, AIRDROP_ABI, readProvider);
      const [alloc, hasClaimed, isOpen, sub] = await Promise.all([
        c.allocation(address)     as Promise<bigint>,
        c.claimed(address)        as Promise<boolean>,
        c.isCampaignOpen()        as Promise<boolean>,
        c.getSubmission(address)  as Promise<[boolean, bigint, string, string, bigint]>,
      ]);
      setStatus({
        allocation: alloc,
        claimed: hasClaimed,
        campaignOpen: isOpen,
        submitted: sub[0],
        submittedEarned: Number(sub[1]),
        submittedTier: sub[2],
        submittedAt: Number(sub[4]),
        loading: false,
        error: null,
      });
    } catch (e) {
      console.warn("useAirdropStatus error:", e);
      setStatus(s => ({ ...s, loading: false, error: "Failed to fetch airdrop status." }));
    }
  }, [address, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refresh(); }, [refresh]);

  return status;
}



async function verifyOnChain(taskId: string, addr: string): Promise<boolean> {
  try {
    switch (taskId) {
      case "buy": {
        if (!RONITE_ADDR) return false;
        const c = new Contract(RONITE_ADDR, ERC20_ABI_MIN, readProvider);
        const bal: bigint = await c.balanceOf(addr);
        return bal > 0n;
      }
      case "s_coal": {
        if (!COAL_STAKING_ADDR) return false;
        const c = new Contract(COAL_STAKING_ADDR, STAKING_ABI_MIN, readProvider);
        const staked: bigint = await c.stakedBalance(addr);
        return staked > 0n;
      }
      case "s_iron": {
        if (!IRON_STAKING_ADDR) return false;
        const c = new Contract(IRON_STAKING_ADDR, STAKING_ABI_MIN, readProvider);
        const staked: bigint = await c.stakedBalance(addr);
        return staked > 0n;
      }
      case "s_gold": {
        if (!GOLD_STAKING_ADDR) return false;
        const c = new Contract(GOLD_STAKING_ADDR, STAKING_ABI_MIN, readProvider);
        const staked: bigint = await c.stakedBalance(addr);
        return staked > 0n;
      }
      case "s_diamond": {
        if (!DIAMOND_STAKING_ADDR) return false;
        const c = new Contract(DIAMOND_STAKING_ADDR, STAKING_ABI_MIN, readProvider);
        const staked: bigint = await c.stakedBalance(addr);
        return staked > 0n;
      }
      case "claim": {
        // Cek apakah wallet hold salah satu ore token
        const pairs = [
          [COAL_REWARD_ADDR, COAL_STAKING_ADDR],
          [IRON_REWARD_ADDR, IRON_STAKING_ADDR],
          [GOLD_REWARD_ADDR, GOLD_STAKING_ADDR],
          [DIAMOND_REWARD_ADDR, DIAMOND_STAKING_ADDR],
        ];
        for (const [rewardAddr] of pairs) {
          if (!rewardAddr) continue;
          const c = new Contract(rewardAddr, ERC20_ABI_MIN, readProvider);
          const bal: bigint = await c.balanceOf(addr);
          if (bal > 0n) return true;
        }
        return false;
      }
      default:
        return false;
    }
  } catch (e) {
    console.warn("verifyOnChain error:", taskId, e);
    return false;
  }
}

// ─── Countdown ───────────────────────────────────────────────────────────────

function useCountdown(endMs: number) {
  const [rem, setRem] = useState(Math.max(0, Math.floor((endMs - Date.now()) / 1000)));
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
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-US");
const pad = (n: number) => String(n).padStart(2, "0");
const getTier     = (e: number) => [...TIERS].reverse().find(t => e >= t.min)!;
const getNextTier = (e: number) => TIERS.find(t => t.min > e) ?? null;
const shortenAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function PixelBox({
  children, style = {},
}: {
  children: React.ReactNode; style?: React.CSSProperties;
}) {
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

function PixelBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{
      height: 8, background: "var(--ronin-dark)",
      border: "2px solid var(--border)", boxShadow: "inset 2px 2px 0 #000",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0,
        width: `${pct}%`,
        background: `linear-gradient(90deg, ${color}66, ${color})`,
        transition: "width 0.6s ease",
      }} />
    </div>
  );
}

function ClockBlock({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: "var(--ronin-dark)", border: "2px solid var(--border)",
      boxShadow: "2px 2px 0 #000", padding: "10px 14px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      minWidth: 48,
    }}>
      <span style={{
        fontFamily: "var(--font-display)", fontSize: 18,
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

function TierBadge({ tier, size = "sm" }: { tier: TierDef; size?: "sm" | "md" }) {
  const fs  = size === "md" ? "8px"      : "6px";
  const efs = size === "md" ? "14px"     : "10px";
  const p   = size === "md" ? "5px 12px" : "3px 8px";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: `${tier.color}22`, border: `2px solid ${tier.color}`,
      padding: p, fontFamily: "var(--font-mono)", fontSize: fs,
      color: tier.color, boxShadow: "2px 2px 0 #000",
      letterSpacing: "0.06em", textTransform: "uppercase" as const,
    }}>
      <span style={{ fontSize: efs }}>{tier.icon}</span>
      {tier.name}
    </span>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

function TaskCard({
  task, address, onVerify, onManualDone,
}: {
  task: Task;
  address: string | null;
  onVerify: (id: string) => void;
  onManualDone: (id: string, proof: string) => void;
}) {
  const [proof, setProof] = React.useState("");
  const [proofError, setProofError] = React.useState<string | null>(null);

  const canVerifyOnChain = ONCHAIN_VERIFIABLE.has(task.id);
  const needsProof = task.proofType !== "none" && !canVerifyOnChain;
  const isSocial = task.category === "social";
  const isReferral = task.category === "referral";

  function validateProof(val: string): boolean {
    const trimmed = val.trim();
    if (!trimmed) { setProofError("This field is required before submitting."); return false; }
    if (task.proofPattern && !task.proofPattern.test(trimmed)) {
      if (task.proofType === "username")
        setProofError("Invalid username format.");
      else if (task.proofType === "txhash")
        setProofError("TX hash must start with 0x followed by 64 hex characters.");
      else if (task.proofType === "wallet")
        setProofError("Invalid wallet address (must be 0x + 40 hex characters).");
      else
        setProofError("Invalid format.");
      return false;
    }
    setProofError(null);
    return true;
  }

  function handleClick() {
    if (task.completed || task.verifying) return;
    if (canVerifyOnChain) {
      if (!address) return;
      if (task.href) window.open(task.href, "_blank", "noopener");
      onVerify(task.id);
    } else {
      if (needsProof && !validateProof(proof)) return;
      if (task.href) window.open(task.href, "_blank", "noopener");
      onManualDone(task.id, proof.trim());
    }
  }

  const btnLabel = task.verifying
    ? "⏳ Submitting…"
    : canVerifyOnChain
    ? "🔍 Verify On-Chain"
    : needsProof
    ? "📤 Submit Proof"
    : "Mark Done";

  const btnDisabled =
    task.completed || task.verifying ||
    (!address && task.category === "onchain") ||
    (needsProof && !proof.trim());

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: "11px 13px",
      background: task.completed
        ? "rgba(34,197,94,0.07)"
        : task.verifying
        ? "rgba(96,165,250,0.05)"
        : "var(--surface-alt)",
      border: `2px solid ${
        task.completed ? "var(--success)"
        : task.verifying ? "var(--accent)"
        : "var(--border)"
      }`,
      boxShadow: "2px 2px 0 #000",
      transition: "border-color 0.15s",
    }}>
      {/* Top row: icon + body + reward */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Icon tile */}
        <div style={{
          width: 30, height: 30, flexShrink: 0,
          background: "var(--ronin-dark)", border: "2px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, boxShadow: "1px 1px 0 #000",
        }}>
          {task.completed ? "✅" : task.verifying ? "⏳" : task.icon}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: "7px",
            color: task.completed ? "var(--success)" : "var(--text)",
            marginBottom: 2,
            opacity: task.completed ? 0.7 : 1,
            textDecoration: task.completed ? "line-through" : "none",
          }}>
            {task.title}
          </div>
          <div style={{ fontSize: "6px", color: "var(--text-muted)", lineHeight: 1.9 }}>
            {task.desc}
          </div>
          {canVerifyOnChain && !task.completed && (
            <div style={{ fontSize: "5.5px", color: "var(--ronin-sky)", marginTop: 3, letterSpacing: "0.06em" }}>
              ⛓ Verified automatically from Ronin mainnet
            </div>
          )}
          {(isSocial || isReferral) && !task.completed && (
            <div style={{ fontSize: "5.5px", color: "var(--text-muted)", marginTop: 3, letterSpacing: "0.06em" }}>
              📋 Manually verified by admin within 48 hrs
            </div>
          )}
          {task.proofType === "txhash" && !task.completed && (
            <div style={{ fontSize: "5.5px", color: "var(--ore)", marginTop: 3, letterSpacing: "0.06em" }}>
              🔗 TX hash verified on Ronin Explorer by admin
            </div>
          )}
        </div>

        {/* Reward */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-end",
          gap: 3, flexShrink: 0,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "7px", color: "var(--ore)", whiteSpace: "nowrap" }}>
            +{fmt(task.reward)}
          </span>
          <span style={{ fontSize: "5.5px", color: "var(--text-muted)", letterSpacing: "0.08em" }}>RONITE</span>
        </div>
      </div>

      {/* Proof input row — hanya tampil jika task belum selesai dan butuh proof */}
      {needsProof && !task.completed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {task.href && (
            <a
              href={task.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: "var(--font-mono)", fontSize: "6px",
                color: "var(--ronin-sky)", textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 4,
                width: "fit-content",
              }}
            >
              🔗 Open the page → then fill in your proof below
            </a>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <input
                value={proof}
                onChange={e => { setProof(e.target.value); setProofError(null); }}
                placeholder={task.proofLabel ?? "Enter proof…"}
                disabled={task.verifying}
                style={{
                  width: "100%",
                  background: "var(--ronin-dark)",
                  border: `2px solid ${proofError ? "var(--danger)" : "var(--border)"}`,
                  color: "var(--text)",
                  fontFamily: "var(--font-mono)", fontSize: "6px",
                  padding: "5px 8px",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
              />
              {proofError && (
                <div style={{ fontSize: "5.5px", color: "var(--danger)", marginTop: 3 }}>
                  ⚠ {proofError}
                </div>
              )}
            </div>
            <button
              onClick={handleClick}
              disabled={btnDisabled}
              style={{
                background: "rgba(96,165,250,0.10)",
                border: "2px solid var(--accent)",
                color: "var(--ronin-sky)",
                fontFamily: "var(--font-mono)", fontSize: "6px",
                padding: "5px 10px",
                cursor: btnDisabled ? "not-allowed" : "pointer",
                boxShadow: "var(--shadow-pixel-sm)", whiteSpace: "nowrap",
                opacity: btnDisabled && !task.verifying ? 0.45 : 1,
                flexShrink: 0,
              }}
            >
              {btnLabel}
            </button>
          </div>
        </div>
      )}

      {/* CTA untuk onchain tasks (tanpa proof input) */}
      {!needsProof && !task.completed && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleClick}
            disabled={btnDisabled}
            style={{
              background: canVerifyOnChain ? "rgba(96,165,250,0.12)" : "transparent",
              border: `2px solid ${canVerifyOnChain ? "var(--accent)" : "var(--border)"}`,
              color: canVerifyOnChain ? "var(--ronin-sky)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: "6px",
              padding: "3px 8px", cursor: btnDisabled ? "not-allowed" : "pointer",
              boxShadow: "var(--shadow-pixel-sm)", whiteSpace: "nowrap",
              opacity: btnDisabled && !task.verifying ? 0.45 : 1,
            }}
          >
            {btnLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Submit Airdrop Panel (on-chain) ─────────────────────────────────────────

const SUBMIT_MIN_EARNED = 10; // Digger tier minimum

function SubmitAirdropPanel({
  address,
  earned,
  tier,
  completedTasks,
  airdrop,
  onRefresh,
  onBurst,
}: {
  address: string | null;
  earned: number;
  tier: TierDef;
  completedTasks: Task[];
  airdrop: AirdropStatus;
  onRefresh: () => void;
  onBurst: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash]         = useState<string | null>(null);
  const [txError, setTxError]       = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);

  if (!AIRDROP_CONTRACT_ADDR) return null;
  if (!address) return null;

  const eligible    = earned >= SUBMIT_MIN_EARNED;
  const isSubmitted = airdrop.submitted;
  const taskIdsStr  = completedTasks.map(t => t.id).join(",");

  async function handleSubmit() {
    if (!address || !eligible || submitting || isSubmitted) return;
    setTxError(null);
    setSubmitting(true);
    try {
      const injected = (window as any).ronin?.provider ?? (window as any).ethereum;
      if (!injected) throw new Error("Ronin Wallet not found.");

      const provider = new BrowserProvider(injected);
      const signer   = await provider.getSigner();
      const c        = new Contract(AIRDROP_CONTRACT_ADDR!, AIRDROP_ABI, signer);

      const { parseEther } = await import("ethers");

      const tx = await c.submitForAirdrop(
        BigInt(earned),
        tier.name,
        taskIdsStr,
        { value: parseEther(SUBMIT_FEE_RON) },
      );

      setTxHash(tx.hash as string);
      await tx.wait();
      onBurst();
      onRefresh(); // re-fetch submission status from chain
    } catch (e: any) {
      const raw: string = e?.reason ?? e?.shortMessage ?? e?.message ?? "Transaction failed.";
      setTxError(raw.length > 140 ? raw.slice(0, 140) + "…" : raw);
    } finally {
      setSubmitting(false);
    }
  }

  function copyTx() {
    if (!txHash) return;
    navigator.clipboard.writeText(txHash).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const borderColor = isSubmitted
    ? "var(--success)"
    : eligible
    ? tier.color
    : "var(--border)";

  return (
    <div style={{
      background: isSubmitted
        ? "rgba(34,197,94,0.07)"
        : eligible
        ? `${tier.color}0d`
        : "var(--surface)",
      border: `3px solid ${borderColor}`,
      boxShadow: `4px 4px 0 #000${eligible && !isSubmitted ? `, 0 0 20px ${tier.color}28` : ""}`,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column" as const,
      gap: 14,
    }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(10px,1.8vw,15px)",
            color: isSubmitted ? "var(--success)" : eligible ? tier.color : "var(--text-muted)",
            textShadow: "2px 2px 0 #000",
            marginBottom: 5,
          }}>
            {isSubmitted ? "✅ SUBMITTED ON-CHAIN" : "📋 SUBMIT FOR AIRDROP"}
          </div>
          <div style={{ fontSize: "6px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", lineHeight: 2 }}>
            {isSubmitted
              ? "Your submission is recorded on Ronin mainnet. Admin will set your RONITE allocation soon."
              : eligible
              ? `Pay 0.01 RON fee → your tasks are recorded on-chain → admin sets your allocation.`
              : `Earn at least ${SUBMIT_MIN_EARNED} RONITE (Digger tier) to unlock submission.`}
          </div>
        </div>

        {/* Earned badge */}
        <div style={{
          background: `${tier.color}18`, border: `2px solid ${tier.color}`,
          padding: "8px 14px", boxShadow: "2px 2px 0 #000",
          display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 3,
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "var(--font-display)", fontSize: "13px",
            color: tier.color, textShadow: "2px 2px 0 #000", lineHeight: 1,
          }}>
            {earned}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "5.5px", color: "var(--text-muted)", letterSpacing: "0.1em" }}>
            RONITE EARNED
          </span>
          <TierBadge tier={tier} size="sm" />
        </div>
      </div>

      {/* Task preview — only when eligible + not yet submitted */}
      {eligible && !isSubmitted && (
        <div style={{
          background: "var(--ronin-dark)", border: "2px solid var(--border)",
          padding: "10px 13px", display: "flex", flexDirection: "column" as const, gap: 7,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "6.5px", color: "var(--text-muted)", marginBottom: 2 }}>
            📊 Task Snapshot — will be stored on-chain
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {completedTasks.map(t => (
              <span key={t.id} style={{
                background: "rgba(34,197,94,0.10)", border: "1px solid var(--success)",
                padding: "2px 7px", fontFamily: "var(--font-mono)", fontSize: "5.5px",
                color: "var(--success)", boxShadow: "1px 1px 0 #000",
              }}>
                {t.icon} {t.title}
              </span>
            ))}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "5.5px", color: "var(--text-muted)" }}>
            {completedTasks.length} tasks · {earned} RONITE · {tier.icon} {tier.name}
          </div>
        </div>
      )}

      {/* On-chain submission receipt */}
      {isSubmitted && (
        <div style={{
          background: "rgba(34,197,94,0.06)", border: "2px solid var(--success)",
          padding: "12px 14px", display: "flex", flexDirection: "column" as const, gap: 8,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "6.5px", color: "var(--success)", marginBottom: 2 }}>
            ⛓ On-Chain Submission Record
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px" }}>
            {[
              ["Wallet",    `${address.slice(0,8)}…${address.slice(-6)}`],
              ["Tier",      `${tier.icon} ${airdrop.submittedTier || tier.name}`],
              ["Earned",    `${airdrop.submittedEarned || earned} RONITE`],
              ["Tasks",     `${airdrop.submittedTier ? completedTasks.length : "—"} completed`],
              ["Submitted", airdrop.submittedAt > 0
                ? new Date(airdrop.submittedAt * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
                : "—"],
            ].map(([label, val]) => (
              <React.Fragment key={label}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "5.5px", color: "var(--text-muted)" }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "5.5px", color: "var(--text)" }}>{val}</span>
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: "5.5px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", lineHeight: 2, marginTop: 2 }}>
            ⏳ Waiting for admin to set your RONITE allocation. Once set, the <strong style={{ color: "var(--ore)" }}>Claim RONITE</strong> button below will activate.
          </div>
        </div>
      )}

      {/* TX hash link after submit */}
      {txHash && (
        <div style={{
          background: "rgba(96,165,250,0.07)", border: "2px solid var(--accent)",
          padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--ronin-sky)" }}>
            ✅ TX:{" "}
            <a
              href={`https://explorer.roninchain.com/tx/${txHash}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--ronin-sky)" }}
            >
              {txHash.slice(0, 12)}…{txHash.slice(-8)} ↗
            </a>
          </span>
          <button
            onClick={copyTx}
            style={{
              background: "transparent", border: "1px solid var(--border)",
              color: copied ? "var(--success)" : "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: "5.5px",
              padding: "3px 8px", cursor: "pointer",
            }}
          >
            {copied ? "✅ Copied" : "📋 Copy TX"}
          </button>
        </div>
      )}

      {/* TX error */}
      {txError && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "2px solid var(--danger)",
          padding: "10px 13px", fontFamily: "var(--font-mono)", fontSize: "6px",
          color: "var(--danger)", lineHeight: 2,
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
        }}>
          <span>❌ {txError}</span>
          <button onClick={() => setTxError(null)} style={{
            background: "transparent", border: "none",
            color: "var(--danger)", cursor: "pointer", fontSize: "10px", flexShrink: 0,
          }}>✕</button>
        </div>
      )}

      {/* Not eligible hint */}
      {!eligible && (
        <div style={{
          background: "rgba(148,163,184,0.06)", border: "2px dashed var(--border)",
          padding: "10px 13px",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)", lineHeight: 2 }}>
            🔒 Need <span style={{ color: "var(--ore)" }}>{SUBMIT_MIN_EARNED - earned} more RONITE</span> to unlock.
            Complete on-chain tasks for the fastest points.
          </div>
        </div>
      )}

      {/* Fee info + Submit button */}
      {!isSubmitted && eligible && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              background: submitting ? "transparent" : `${tier.color}20`,
              border: `2px solid ${tier.color}`,
              color: tier.color,
              fontFamily: "var(--font-display)", fontSize: "9px",
              padding: "10px 22px",
              cursor: submitting ? "not-allowed" : "pointer",
              boxShadow: submitting ? "none" : "3px 3px 0 #000",
              textShadow: "1px 1px 0 #000",
              letterSpacing: "0.04em",
              opacity: submitting ? 0.65 : 1,
            }}
          >
            {submitting ? "⏳ SUBMITTING…" : "📤 SUBMIT — 0.01 RON"}
          </button>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--ore)" }}>
              💎 Fee: 0.01 RON (one-time)
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "5.5px", color: "var(--text-muted)" }}>
              Recorded permanently on Ronin mainnet
            </span>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Claim Panel ──────────────────────────────────────────────────────────────

function ClaimPanel({
  address,
  airdrop,
  onRefresh,
  onBurst,
}: {
  address: string | null;
  airdrop: AirdropStatus;
  onRefresh: () => void;
  onBurst: () => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTx, setClaimTx] = useState<string | null>(null);

  if (!AIRDROP_CONTRACT_ADDR) return null;

  const allocFormatted = airdrop.allocation > 0n
    ? Number(airdrop.allocation / 10n ** 15n) / 1000   // 18 dec → float, 3 dp precision
    : 0;

  async function doClaim() {
    if (!address || claiming) return;
    setClaimError(null);
    setClaiming(true);
    try {
      const injected = (window as any).ronin?.provider ?? (window as any).ethereum;
      if (!injected) throw new Error("Ronin Wallet not found.");
      const provider = new BrowserProvider(injected);
      const signer   = await provider.getSigner();
      const c        = new Contract(AIRDROP_CONTRACT_ADDR!, AIRDROP_ABI, signer);
      const tx       = await c.claim();
      setClaimTx(tx.hash as string);
      await tx.wait();
      onBurst();
      onRefresh();
    } catch (e: any) {
      const msg: string = e?.reason ?? e?.shortMessage ?? e?.message ?? "Transaction failed.";
      setClaimError(msg.length > 120 ? msg.slice(0, 120) + "…" : msg);
    } finally {
      setClaiming(false);
    }
  }

  // State logic
  const notConnected   = !address;
  const notAllocated   = !airdrop.loading && airdrop.allocation === 0n;
  const alreadyClaimed = airdrop.claimed;
  const notOpen        = !airdrop.campaignOpen;
  const canClaim       = !notConnected && !notAllocated && !alreadyClaimed && airdrop.campaignOpen;

  const borderColor = alreadyClaimed ? "var(--success)"
    : canClaim      ? "var(--ore)"
    : "var(--border)";

  return (
    <div style={{
      background: alreadyClaimed
        ? "rgba(34,197,94,0.07)"
        : canClaim
        ? "rgba(245,158,11,0.06)"
        : "var(--surface)",
      border: `3px solid ${borderColor}`,
      boxShadow: `4px 4px 0 #000${canClaim ? ", 0 0 24px rgba(245,158,11,0.18)" : ""}`,
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column" as const,
      gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(11px,1.8vw,16px)",
            color: alreadyClaimed ? "var(--success)" : "var(--ore)",
            textShadow: "2px 2px 0 #000", marginBottom: 4,
          }}>
            {alreadyClaimed ? "✅ AIRDROP CLAIMED!" : "🎁 CLAIM YOUR AIRDROP"}
          </div>
          <div style={{ fontSize: "6px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {alreadyClaimed
              ? "Tokens have been sent to your wallet."
              : "Send your earned RONITE directly from the contract to your wallet."}
          </div>
        </div>
        {!airdrop.loading && airdrop.allocation > 0n && (
          <div style={{
            background: "rgba(245,158,11,0.12)", border: "2px solid var(--ore)",
            padding: "8px 14px", boxShadow: "2px 2px 0 #000",
            display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 2,
          }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: "14px", color: "var(--ore)", textShadow: "2px 2px 0 #000", lineHeight: 1 }}>
              {allocFormatted.toLocaleString("en-US", { maximumFractionDigits: 3 })}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "5.5px", color: "var(--text-muted)", letterSpacing: "0.1em" }}>
              RONITE ALLOCATED
            </span>
          </div>
        )}
      </div>

      {/* Status messages */}
      {airdrop.loading && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "6.5px", color: "var(--text-muted)" }}>
          ⏳ Checking allocation on Ronin mainnet…
        </div>
      )}
      {!airdrop.loading && notConnected && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "6.5px", color: "var(--text-muted)" }}>
          🔒 Connect wallet to check your allocation.
        </div>
      )}
      {!airdrop.loading && !notConnected && notAllocated && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "2px solid var(--danger)",
          padding: "10px 13px", fontFamily: "var(--font-mono)", fontSize: "6.5px",
          color: "var(--danger)", boxShadow: "2px 2px 0 #000",
        }}>
          ⚠ No allocation found for this wallet. Complete the on-chain tasks first, then wait for the admin snapshot.
        </div>
      )}
      {!airdrop.loading && !notConnected && !notAllocated && notOpen && !alreadyClaimed && (
        <div style={{
          background: "rgba(96,165,250,0.08)", border: "2px solid var(--accent)",
          padding: "10px 13px", fontFamily: "var(--font-mono)", fontSize: "6.5px",
          color: "var(--ronin-sky)", boxShadow: "2px 2px 0 #000",
        }}>
          🕐 Campaign not yet open. Your allocation of {allocFormatted.toLocaleString()} RONITE is reserved — claim opens when the campaign starts.
        </div>
      )}
      {airdrop.error && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "2px solid var(--danger)",
          padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: "6px",
          color: "var(--danger)",
        }}>
          ⚠ {airdrop.error}
        </div>
      )}

      {/* Claim TX link */}
      {claimTx && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--success)" }}>
          ✅ TX submitted:{" "}
          <a
            href={`https://explorer.roninchain.com/tx/${claimTx}`}
            target="_blank" rel="noopener noreferrer"
            style={{ color: "var(--ronin-sky)", textDecoration: "none" }}
          >
            {claimTx.slice(0, 10)}…{claimTx.slice(-6)} ↗
          </a>
        </div>
      )}

      {/* Claim error */}
      {claimError && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "2px solid var(--danger)",
          padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: "6px",
          color: "var(--danger)",
        }}>
          ❌ {claimError}
        </div>
      )}

      {/* Claim button */}
      {!alreadyClaimed && !notConnected && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={doClaim}
            disabled={!canClaim || claiming}
            style={{
              background: canClaim
                ? "rgba(245,158,11,0.15)"
                : "transparent",
              border: `2px solid ${canClaim ? "var(--ore)" : "var(--border)"}`,
              color: canClaim ? "var(--ore)" : "var(--text-muted)",
              fontFamily: "var(--font-display)", fontSize: "9px",
              padding: "10px 22px",
              cursor: (!canClaim || claiming) ? "not-allowed" : "pointer",
              boxShadow: canClaim ? "3px 3px 0 #000" : "none",
              opacity: (!canClaim && !claiming) ? 0.5 : 1,
              textShadow: canClaim ? "1px 1px 0 #000" : "none",
              letterSpacing: "0.04em",
              transition: "opacity 0.15s",
            }}
          >
            {claiming ? "⏳ CLAIMING…" : "⛏ CLAIM RONITE"}
          </button>
          <button
            onClick={onRefresh}
            disabled={airdrop.loading}
            style={{
              background: "transparent",
              border: "2px solid var(--border)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: "6px",
              padding: "6px 12px", cursor: "pointer",
              boxShadow: "2px 2px 0 #000",
              opacity: airdrop.loading ? 0.5 : 1,
            }}
          >
            🔄 Refresh
          </button>
          {canClaim && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--ore)" }}>
              ← Ready to claim!
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Coin burst ───────────────────────────────────────────────────────────────

const BURST_ITEMS = ["💰", "⭐", "💎", "⛏", "🌟", "💰"];
const BURST_KEYFRAMES = BURST_ITEMS.map((_, i) => {
  const angle = (i / BURST_ITEMS.length) * Math.PI * 2;
  const tx = Math.round(Math.cos(angle) * 70);
  const ty = Math.round(Math.sin(angle) * 70);
  return `@keyframes cb${i}{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(${tx}px,${ty}px)}}`;
}).join("");

function CoinBurst({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <>
      <style>{BURST_KEYFRAMES}</style>
      <div style={{ position: "fixed", top: "50%", left: "50%", pointerEvents: "none", zIndex: 9999 }}>
        {BURST_ITEMS.map((e, i) => (
          <span key={i} style={{
            position: "absolute", fontSize: 20,
            animation: `cb${i} 0.75s steps(4) forwards`,
            animationDelay: `${i * 0.04}s`,
          }}>{e}</span>
        ))}
      </div>
    </>
  );
}

// ─── Verify All button ────────────────────────────────────────────────────────

function VerifyAllBar({
  address, onVerifyAll, verifying,
}: {
  address: string | null;
  onVerifyAll: () => void;
  verifying: boolean;
}) {
  if (!address) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 12, padding: "10px 14px",
      background: "rgba(96,165,250,0.07)",
      border: "2px solid var(--accent)",
      boxShadow: "var(--shadow-pixel-sm)",
      flexWrap: "wrap",
    }}>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "7px", color: "var(--ronin-sky)", marginBottom: 3 }}>
          ⛓ On-Chain Verification
        </div>
        <div style={{ fontSize: "6px", color: "var(--text-muted)" }}>
          Check all on-chain tasks against Ronin mainnet in one click.
        </div>
      </div>
      <button
        className="btn btn--primary"
        onClick={onVerifyAll}
        disabled={verifying}
        style={{ fontSize: "7px", whiteSpace: "nowrap" }}
      >
        {verifying ? "⏳ Checking…" : "🔍 Verify All On-Chain"}
      </button>
    </div>
  );
}

// ─── Pool stats hook ──────────────────────────────────────────────────────────

interface PoolStats {
  submitterCount: bigint;
  totalAllocated: bigint;
  totalClaimed:   bigint;
  remaining:      bigint;
  loading:        boolean;
}

function usePoolStats(refreshKey = 0): PoolStats {
  const [stats, setStats] = useState<PoolStats>({
    submitterCount: 0n,
    totalAllocated: 0n,
    totalClaimed:   0n,
    remaining:      0n,
    loading:        true,
  });

  useEffect(() => {
    if (!AIRDROP_CONTRACT_ADDR) {
      setStats(s => ({ ...s, loading: false }));
      return;
    }
    (async () => {
      setStats(s => ({ ...s, loading: true }));
      try {
        const c = new Contract(AIRDROP_CONTRACT_ADDR, AIRDROP_ABI, readProvider);
        const [submitters, totAlloc, totClaimed, remaining] = await Promise.all([
          c.submitterCount()    as Promise<bigint>,
          c.totalAllocated()    as Promise<bigint>,
          c.totalClaimed()      as Promise<bigint>,
          c.remainingBalance()  as Promise<bigint>,
        ]);
        setStats({ submitterCount: submitters, totalAllocated: totAlloc, totalClaimed: totClaimed, remaining, loading: false });
      } catch (e) {
        console.warn("usePoolStats error:", e);
        setStats(s => ({ ...s, loading: false }));
      }
    })();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return stats;
}

// ─── Contract info + pool stats panel ────────────────────────────────────────

function ContractInfoPanel({ poolStats }: { poolStats: PoolStats }) {
  const EXPLORER = "https://explorer.roninchain.com";

  const fmtBig = (raw: bigint) =>
    raw > 0n
      ? Number(raw / 10n ** 15n / 1000n).toLocaleString("en-US", { maximumFractionDigits: 0 })
      : "—";

  const pct = poolStats.totalAllocated > 0n
    ? (Number((poolStats.totalClaimed * 10000n) / poolStats.totalAllocated) / 100).toFixed(1)
    : "0.0";

  return (
    <PixelBox style={{ padding: "16px 18px" }}>
      <SectionLabel>🔗 Contract Info &amp; Pool Stats</SectionLabel>

      {/* Contract addresses */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {[
          {
            label: "Airdrop Contract",
            val: AIRDROP_CONTRACT_ADDR ?? "❌ Not set (VITE_AIRDROP_CONTRACT_ADDRESS)",
          },
          {
            label: "RONITE Token",
            val: (import.meta.env.VITE_RONITE_TOKEN_ADDRESS as string | undefined) ?? "❌ Not set",
          },
          {
            label: "Network",
            val: "Ronin Mainnet · Chain ID 2020",
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
                {val} ↗
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

      {/* Live pool stats */}
      <div style={{
        background: "var(--ronin-dark)", border: "2px solid var(--border)",
        padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "6px",
          color: "var(--ronin-sky)", letterSpacing: "0.08em",
          textTransform: "uppercase" as const, marginBottom: 2,
        }}>
          {poolStats.loading ? "⏳ Fetching on-chain data…" : "⛓ Live On-Chain Pool Stats"}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {[
            { label: "Total Submitters",   value: poolStats.loading ? "…" : poolStats.submitterCount.toString() },
            { label: "Total Pool (RONITE)", value: poolStats.loading ? "…" : fmtBig(poolStats.totalAllocated) },
            { label: "Distributed",         value: poolStats.loading ? "…" : fmtBig(poolStats.totalClaimed) },
            { label: "Remaining",           value: poolStats.loading ? "…" : fmtBig(poolStats.remaining) },
          ].map(({ label, value }) => (
            <div key={label} style={{
              flex: "1 1 90px",
              background: "rgba(0,0,0,0.3)", border: "2px solid var(--border)",
              padding: "8px 10px", boxShadow: "1px 1px 0 #000",
            }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: "5.5px",
                color: "var(--text-muted)", textTransform: "uppercase" as const,
                letterSpacing: "0.08em", marginBottom: 5,
              }}>
                {label}
              </div>
              <div style={{
                fontFamily: "var(--font-display)", fontSize: "9px",
                color: "var(--ore)", textShadow: "1px 1px 0 #000",
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        {/* Distribution progress bar */}
        {!poolStats.loading && poolStats.totalAllocated > 0n && (
          <>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontFamily: "var(--font-mono)", fontSize: "6px",
              color: "var(--text-muted)",
            }}>
              <span>⛏ Distribution Progress</span>
              <span style={{ color: "var(--ore)" }}>{pct}%</span>
            </div>
            <div style={{
              height: 8, background: "var(--surface)",
              border: "2px solid var(--border)", boxShadow: "inset 2px 2px 0 #000",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, bottom: 0,
                width: `${pct}%`,
                background: "linear-gradient(90deg, #f59e0b66, #f59e0b)",
                transition: "width 0.6s ease",
              }} />
            </div>
          </>
        )}
      </div>
    </PixelBox>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AirdropPage() {
  const { address, connecting, chainOk, connect } = useWallet();
  const [airdropRefresh, setAirdropRefresh] = useState(0);
  const refreshAirdrop = useCallback(() => setAirdropRefresh(n => n + 1), []);
  const airdrop = useAirdropStatus(address, airdropRefresh);
  const poolStats = usePoolStats(airdropRefresh);

  const [tasks, setTasks]         = useState<Task[]>(loadTasks);
  const [tab, setTab]             = useState<Category>("social");
  const [burst, setBurst]         = useState(false);
  const [copied, setCopied]       = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyError, setVerifyError]   = useState<string | null>(null);
  const burstRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Campaign end — 30 September 2026 23:59:59 WIB (UTC+7) = 30 Sep 2026 16:59:59 UTC
  const endMs = useRef(new Date("2026-09-30T16:59:59Z").getTime()).current;
  const { d, h, m, s } = useCountdown(endMs);

  const earned    = tasks.filter(t => t.completed).reduce((a, t) => a + t.reward, 0);
  const maxEarn   = tasks.reduce((a, t) => a + t.reward, 0);
  const doneCount = tasks.filter(t => t.completed).length;
  const tier      = getTier(earned);
  const nextTier  = getNextTier(earned);

  const refLink = address
    ? `https://ronite.fun/#airdrop?ref=${address.slice(0, 8)}`
    : "Connect wallet to generate your link";

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function triggerBurst() {
    setBurst(true);
    if (burstRef.current) clearTimeout(burstRef.current);
    burstRef.current = setTimeout(() => setBurst(false), 850);
  }

  // ── Single task on-chain verify ──────────────────────────────────────────────

  async function handleVerify(taskId: string) {
    if (!address) return;
    setVerifyError(null);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, verifying: true } : t));
    try {
      const ok = await verifyOnChain(taskId, address);
      if (ok) {
        setTasks(prev => {
          const next = prev.map(t =>
            t.id === taskId ? { ...t, completed: true, verifying: false } : t,
          );
          persistTasks(next);
          return next;
        });
        triggerBurst();
      } else {
        setVerifyError(`Task "${INITIAL_TASKS.find(t => t.id === taskId)?.title}" not yet completed on-chain. Complete it first, then verify again.`);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, verifying: false } : t));
      }
    } catch {
      setVerifyError("RPC error — try again in a moment.");
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, verifying: false } : t));
    }
  }

  // ── Verify all on-chain tasks ────────────────────────────────────────────────

  async function handleVerifyAll() {
    if (!address || verifyingAll) return;
    setVerifyError(null);
    setVerifyingAll(true);

    // snapshot which ids are already done *right now* (avoids stale closure)
    const alreadyDone = new Set(
      tasks.filter(t => t.completed).map(t => t.id),
    );
    const ids = Array.from(ONCHAIN_VERIFIABLE).filter(id => !alreadyDone.has(id));

    let newlyCompleted = 0;
    for (const id of ids) {
      // mark this task as verifying
      setTasks(prev => prev.map(t => t.id === id ? { ...t, verifying: true } : t));
      try {
        const ok = await verifyOnChain(id, address);
        if (ok) {
          // use functional update so we always write to latest state
          setTasks(prev => {
            const next = prev.map(t =>
              t.id === id ? { ...t, completed: true, verifying: false } : t,
            );
            persistTasks(next);
            return next;
          });
          newlyCompleted++;
          triggerBurst();
        } else {
          setTasks(prev => prev.map(t => t.id === id ? { ...t, verifying: false } : t));
        }
      } catch {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, verifying: false } : t));
      }
    }

    setVerifyingAll(false);
    if (newlyCompleted === 0) {
      setVerifyError("No new tasks found on-chain. Make sure you've completed them on the Mining page first.");
    }
  }

  // ── Manual done (social / sell / referral) — 1.5s submit delay ────────────

  // ── Verify TX hash on-chain (untuk task "sell") ──────────────────────────
  async function verifyTxHash(txHash: string, expectedFrom: string): Promise<{ ok: boolean; reason: string }> {
    try {
      const tx = await readProvider.getTransaction(txHash);
      if (!tx) return { ok: false, reason: "TX tidak ditemukan di Ronin mainnet. Pastikan hash benar." };
      if (tx.from.toLowerCase() !== expectedFrom.toLowerCase())
        return { ok: false, reason: `TX bukan dari wallet kamu (dari: ${tx.from.slice(0,8)}…).` };
      const receipt = await readProvider.getTransactionReceipt(txHash);
      if (!receipt) return { ok: false, reason: "TX belum dikonfirmasi. Tunggu beberapa saat lalu coba lagi." };
      if (receipt.status === 0) return { ok: false, reason: "TX gagal (reverted). Submit TX sell yang berhasil." };
      return { ok: true, reason: "" };
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? "RPC error saat verifikasi TX." };
    }
  }

  async function handleManualDone(id: string, proof: string) {
    const task = tasks.find(t => t.id === id);
    if (!task || task.completed || task.verifying) return;

    setTasks(prev => prev.map(t => t.id === id ? { ...t, verifying: true } : t));

    // ── Task "sell": verifikasi TX hash via RPC ──────────────────────────
    if (id === "sell" && address) {
      const { ok, reason } = await verifyTxHash(proof.trim(), address);
      if (!ok) {
        setVerifyError(`⛔ TX tidak valid: ${reason}`);
        setTasks(prev => prev.map(t => t.id === id ? { ...t, verifying: false } : t));
        return;
      }
    } else {
      // Social / referral — 1.5s delay (manual admin check)
      await new Promise<void>(resolve => setTimeout(resolve, 1500));
    }

    // Save proof to localStorage for admin reference
    try {
      const proofStore = JSON.parse(localStorage.getItem("ronite_proofs") ?? "{}");
      proofStore[id] = { proof, address: address ?? "anon", ts: Date.now() };
      localStorage.setItem("ronite_proofs", JSON.stringify(proofStore));
    } catch { /* ignore */ }

    setTasks(prev => {
      const next = prev.map(t =>
        t.id === id ? { ...t, completed: true, verifying: false } : t,
      );
      persistTasks(next);
      return next;
    });
    triggerBurst();
  }

  function copyRef() {
    if (!address) return;
    navigator.clipboard.writeText(refLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const visibleTasks = tasks.filter(t => t.category === tab);
  const onchainTasks = tasks.filter(t => t.category === "onchain");
  const pendingOnchain = onchainTasks.filter(t => !t.completed).length;

  function handleTabChange(cat: Category) {
    setTab(cat);
    setVerifyError(null);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="grid-backdrop" aria-hidden="true" />
      <CoinBurst active={burst} />

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            className="btn btn--docs"
            onClick={() => { window.location.hash = ""; }}
            style={{ fontSize: "7px" }}
          >
            ← Mining
          </button>
          <div className="brand">
            <span className="brand-mark">🎁</span>
            <span className="brand-name">AIRDROP</span>
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
          {!chainOk && address && (
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
              <span className="status-dot status-dot--live" />
              <span className="mono">{shortenAddr(address)}</span>
              <span className="chip-divider" />
              <TierBadge tier={tier} size="sm" />
            </div>
          ) : (
            <button className="btn btn--primary" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <main className="content">

        {/* Hero */}
        <section style={{
          background: "linear-gradient(135deg, #0c0e14 0%, #12161f 50%, #1a0a30 100%)",
          border: "3px solid var(--accent)",
          boxShadow: "4px 4px 0 #000, 0 0 32px rgba(37,99,235,0.15)",
          padding: "26px 28px 22px",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "repeating-linear-gradient(transparent,transparent 3px,rgba(0,0,0,0.22) 3px,rgba(0,0,0,0.22) 4px)",
          }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{
              fontSize: "6px", fontFamily: "var(--font-mono)",
              color: "var(--ronin-sky)", textTransform: "uppercase" as const,
              letterSpacing: "0.16em", marginBottom: 10,
            }}>
              🎁 Official Airdrop · Season 1 · Ronin Mainnet
            </div>
            <div style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(13px, 2.2vw, 20px)",
              color: "var(--ore)",
              textShadow: "3px 3px 0 #000, -1px -1px 0 #7a4d00",
              lineHeight: 1.55, marginBottom: 16,
            }}>
              2,000,000 RONITE<br />
              <span style={{ color: "var(--text)", fontSize: "clamp(7px,1.2vw,10px)" }}>
                Complete tasks. Climb tiers. Earn your share.
              </span>
            </div>
            <div style={{ maxWidth: 480 }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontFamily: "var(--font-mono)", fontSize: "6px",
                color: "var(--text-muted)", marginBottom: 6,
              }}>
                <span>⛏ Distributed so far</span>
                <span style={{ color: "var(--ore)" }}>
                  {poolStats.loading
                    ? "Loading…"
                    : `${poolStats.totalAllocated > 0n
                        ? Number(poolStats.totalAllocated / 10n ** 18n).toLocaleString("en-US")
                        : "0"} / ${fmt(TOTAL_REWARD)} RONITE`
                  }
                </span>
              </div>
              <PixelBar
                value={poolStats.totalAllocated > 0n ? Number(poolStats.totalAllocated / 10n ** 18n) : 0}
                max={TOTAL_REWARD}
                color="#f59e0b"
              />
            </div>
          </div>
        </section>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <PixelBox style={{ padding: "16px 18px" }}>
            <SectionLabel>⏱ Campaign Ends In</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ClockBlock label="days" value={d} />
              <ClockBlock label="hrs"  value={h} />
              <ClockBlock label="min"  value={m} />
              <ClockBlock label="sec"  value={s} />
            </div>
          </PixelBox>

          <PixelBox style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <SectionLabel>🏆 Your Progress</SectionLabel>
              <TierBadge tier={tier} size="sm" />
            </div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: "15px",
              color: "var(--ore)", textShadow: "2px 2px 0 #000",
            }}>
              {fmt(earned)}{" "}
              <span style={{ fontSize: "7px", color: "var(--text-muted)" }}>RONITE</span>
            </div>
            <PixelBar value={earned} max={maxEarn} color={tier.color} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)" }}>
              {doneCount} / {tasks.length} tasks completed
            </div>
            {nextTier ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)" }}>
                {fmt(nextTier.min - earned)} more →{" "}
                <span style={{ color: nextTier.color }}>{nextTier.icon} {nextTier.name}</span>
              </div>
            ) : (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--success)" }}>
                ✅ MAX TIER — Vaultkeeper!
              </div>
            )}
          </PixelBox>
        </div>

        {/* Submit for Airdrop Panel */}
        <SubmitAirdropPanel
          address={address}
          earned={earned}
          tier={tier}
          completedTasks={tasks.filter(t => t.completed)}
          airdrop={airdrop}
          onRefresh={refreshAirdrop}
          onBurst={triggerBurst}
        />

        {/* Claim Panel */}
        <ClaimPanel
          address={address}
          airdrop={airdrop}
          onRefresh={refreshAirdrop}
          onBurst={triggerBurst}
        />

        {/* Tier roadmap */}
        <PixelBox style={{ padding: "16px 18px", background: "var(--surface-alt)" }}>
          <SectionLabel>🗺 Tier Roadmap</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TIERS.map((t, i) => {
              const isActive = tier.name === t.name;
              const isPast   = earned >= t.min;
              return (
                <div key={t.name} style={{
                  flex: "1 1 90px", position: "relative",
                  background: isActive ? `${t.color}1a` : "var(--ronin-dark)",
                  border: `2px solid ${isPast ? t.color : "var(--border)"}`,
                  padding: "10px 12px",
                  boxShadow: isActive
                    ? `0 0 14px ${t.color}44, 2px 2px 0 #000`
                    : "2px 2px 0 #000",
                }}>
                  {isActive && (
                    <div style={{
                      position: "absolute", top: -9, left: "50%",
                      transform: "translateX(-50%)",
                      fontSize: "8px", animation: "blink-pixel 1s steps(1) infinite",
                    }}>▼</div>
                  )}
                  <div style={{ fontSize: 17, marginBottom: 5 }}>{t.icon}</div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "7px",
                    color: isPast ? t.color : "var(--text-muted)", marginBottom: 3,
                  }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: "5.5px", color: "var(--text-muted)", lineHeight: 1.9 }}>
                    {t.label}
                  </div>
                  {i < TIERS.length - 1 && (
                    <div style={{
                      position: "absolute", right: -11, top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "7px", color: "var(--border)",
                    }}>→</div>
                  )}
                </div>
              );
            })}
          </div>
        </PixelBox>

        {/* Referral */}
        <PixelBox style={{ padding: "16px 18px", borderColor: "var(--ronin-purple)" }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 12,
          }}>
            <div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: "8px",
                color: "var(--ronin-purple)", marginBottom: 4,
              }}>
                👥 Your Referral Link
              </div>
              <div style={{ fontSize: "6px", color: "var(--text-muted)" }}>
                Refer friends to stake RONITE and earn +1 RONITE per referral task once verified by admin.
              </div>
            </div>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--ronin-purple)",
              background: "rgba(168,85,247,0.12)", border: "1px solid var(--ronin-purple)",
              padding: "3px 8px", boxShadow: "1px 1px 0 #000",
            }}>
              +1 RONITE / task
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              flex: 1, background: "var(--ronin-dark)", border: "2px solid var(--border)",
              padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: "6.5px",
              color: address ? "var(--text)" : "var(--text-muted)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {refLink}
            </div>
            <button
              onClick={copyRef}
              disabled={!address}
              style={{
                background: copied ? "rgba(34,197,94,0.14)" : "transparent",
                border: `2px solid ${copied ? "var(--success)" : "var(--ronin-purple)"}`,
                color: copied ? "var(--success)" : "var(--ronin-purple)",
                fontFamily: "var(--font-mono)", fontSize: "7px",
                padding: "8px 14px",
                cursor: address ? "pointer" : "not-allowed",
                boxShadow: "var(--shadow-pixel-sm)", whiteSpace: "nowrap",
                opacity: address ? 1 : 0.5,
              }}
            >
              {copied ? "✅ Copied!" : "📋 Copy"}
            </button>
          </div>
        </PixelBox>

        {/* Task Board */}
        <PixelBox style={{ overflow: "hidden" }}>
          {/* Tabs */}
          <div style={{
            display: "flex", borderBottom: "2px solid var(--border)",
            background: "var(--ronin-dark)",
          }}>
            {(["social", "onchain", "referral"] as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => handleTabChange(cat)}
                style={{
                  flex: 1, background: tab === cat ? "var(--surface)" : "transparent",
                  border: "none",
                  borderBottom: `2px solid ${tab === cat ? "var(--accent)" : "transparent"}`,
                  borderRight: "1px solid var(--border)",
                  color: tab === cat ? "var(--accent)" : "var(--text-muted)",
                  fontFamily: "var(--font-mono)", fontSize: "6px",
                  padding: "10px 6px", cursor: "pointer",
                  textTransform: "uppercase" as const, letterSpacing: "0.08em",
                }}
              >
                {CAT_LABELS[cat]}
                {cat === "onchain" && pendingOnchain > 0 && (
                  <span style={{
                    marginLeft: 6, background: "var(--accent)",
                    color: "#fff", fontFamily: "var(--font-mono)",
                    fontSize: "5.5px", padding: "1px 5px",
                    boxShadow: "1px 1px 0 #000",
                  }}>
                    {pendingOnchain}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Verify all bar — only on onchain tab */}
          {tab === "onchain" && (
            <div style={{ padding: "12px 16px 0" }}>
              <VerifyAllBar
                address={address}
                onVerifyAll={handleVerifyAll}
                verifying={verifyingAll}
              />
            </div>
          )}

          {/* Verify error */}
          {verifyError && tab === "onchain" && (
            <div style={{
              margin: "10px 16px 0",
              padding: "10px 13px",
              background: "rgba(239,68,68,0.08)",
              border: "2px solid var(--danger)",
              boxShadow: "var(--shadow-pixel-sm)",
              fontFamily: "var(--font-mono)", fontSize: "6.5px",
              color: "var(--danger)", lineHeight: 2,
              display: "flex", justifyContent: "space-between", alignItems: "flex-start",
              gap: 10,
            }}>
              <span>⚠ {verifyError}</span>
              <button
                onClick={() => setVerifyError(null)}
                style={{
                  background: "transparent", border: "none",
                  color: "var(--danger)", cursor: "pointer", fontSize: "10px", flexShrink: 0,
                }}
              >✕</button>
            </div>
          )}

          {/* Tasks list */}
          <div style={{ padding: "12px 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {!address && (
              <div style={{
                textAlign: "center", padding: "20px",
                fontFamily: "var(--font-mono)", fontSize: "7px",
                color: "var(--text-muted)", background: "var(--ronin-dark)",
                border: "2px dashed var(--border)",
              }}>
                🔒 Connect wallet to track &amp; verify tasks
              </div>
            )}
            {visibleTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                address={address}
                onVerify={handleVerify}
                onManualDone={handleManualDone}
              />
            ))}
          </div>
        </PixelBox>

        {/* Contract Info + Pool Stats */}
        <ContractInfoPanel poolStats={poolStats} />

        {/* How It Works */}
        <PixelBox style={{ padding: "16px 18px", background: "var(--surface-alt)" }}>
          <SectionLabel>📖 How It Works</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { n: "1", t: "Complete Tasks",    d: "Social, on-chain, and referral tasks each carry a RONITE reward." },
              { n: "2", t: "Climb the Tiers",   d: "Earn more to unlock Digger → Forger → Vaultkeeper. Higher tiers get bonus multipliers in Season 2." },
              { n: "3", t: "Campaign Snapshot", d: "At the end of Season 1, all balances are snapshotted on Ronin mainnet." },
              { n: "4", t: "Receive Airdrop",   d: "RONITE is sent directly to your wallet soon after the snapshot." },
            ].map(step => (
              <div key={step.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{
                  width: 22, height: 22, background: "var(--accent)", color: "#000",
                  fontFamily: "var(--font-display)", fontSize: "9px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, boxShadow: "2px 2px 0 #000",
                }}>
                  {step.n}
                </div>
                <div>
                  <div style={{
                    fontFamily: "var(--font-mono)", fontSize: "7px",
                    color: "var(--text)", marginBottom: 2,
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

        {/* Rules */}
        <PixelBox style={{ padding: "16px 18px" }}>
          <SectionLabel>⚖ Rules &amp; Eligibility</SectionLabel>
          <ul style={{
            margin: 0, padding: "0 0 0 14px",
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            {[
              "One wallet per participant. Sybil addresses will be disqualified.",
              "On-chain tasks are verified automatically via smart contract reads on Ronin mainnet.",
              "Social tasks are verified manually within 48 hours of submission.",
              "Referrals only count if the referred wallet stakes at least 10 RONITE.",
              "Airdrop is distributed in RONITE on Ronin Mainnet (chain ID 2020).",
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
        Copyright Ronite 2026 · Airdrop Season 1 · Built on Ronin Mainnet · Chain ID 2020
      </footer>
    </div>
  );
}