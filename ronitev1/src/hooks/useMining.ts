// Copyright (c) 2026-present The Ronite developers
// Create in 2026

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, parseEther, formatEther } from "ethers";
import { POOLS, RONITE_ADDRESS, RONIN_MAINNET, BACKEND_URL } from "../lib/chain";
import { ERC20_ABI, MINING_STAKING_ABI, RONITE_ABI, ORE_MARKET_ABI } from "../lib/abi";
import { connectWallet, getInjectedProvider } from "../lib/wallet";
import { toTokenUnits } from "../lib/format";

export interface PoolState {
  symbol:         string;
  name:           string;
  rarity:         string;
  color:          string;
  // network
  totalStaked:    bigint;
  rewardRate:     bigint;
  periodFinish:   number;
  miningActive:   boolean;
  rewardDecimals: number;
  // miner
  staked:         bigint;
  pendingReward:  bigint;
  liveReward:     bigint;
  allowance:      bigint;
  // sell
  oreBalance:     bigint;
  // lifetime
  totalMined:     bigint;  // oreBalance + lifetime claimed (tracked locally)
  // global (network-wide, not wallet-specific)
  globalMinted:   bigint;  // rewardToken.totalSupply() — total ore ever mined by everyone
}

// ── Lifetime claimed helpers (localStorage) ────────────────────────────────
function claimedKey(addr: string, symbol: string) {
  return `ronite_claimed_${addr.toLowerCase()}_${symbol}`;
}
function getLifetimeClaimed(addr: string, symbol: string): bigint {
  try {
    const v = localStorage.getItem(claimedKey(addr, symbol));
    return v ? BigInt(v) : 0n;
  } catch { return 0n; }
}
function addLifetimeClaimed(addr: string, symbol: string, amount: bigint) {
  try {
    const prev = getLifetimeClaimed(addr, symbol);
    localStorage.setItem(claimedKey(addr, symbol), (prev + amount).toString());
  } catch { /* ignore */ }
}

const readProvider = new JsonRpcProvider(
  RONIN_MAINNET.rpcUrls[0],
  { chainId: RONIN_MAINNET.chainId, name: "ronin" },
  { staticNetwork: true, batchMaxCount: 1 }
);

function makeInitialPools(): PoolState[] {
  return POOLS.map(p => ({
    symbol: p.symbol, name: p.name, rarity: p.rarity, color: p.color,
    totalStaked: 0n, rewardRate: 0n, periodFinish: 0,
    miningActive: false, rewardDecimals: 18,
    staked: 0n, pendingReward: 0n, liveReward: 0n, allowance: 0n,
    oreBalance: 0n, totalMined: 0n, globalMinted: 0n,
  }));
}

export function useMining() {
  const [address, setAddress]           = useState<string | null>(null);
  const [connecting, setConnecting]     = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [pools, setPools]               = useState<PoolState[]>(makeInitialPools);
  const [roniteBalance, setRoniteBalance] = useState(0n);
  const [roniteAllowance, setRoniteAllowance] = useState<Record<string, bigint>>({});
  const [ronBalance, setRonBalance]       = useState(0n);
  const [roniteSupply, setRoniteSupply]   = useState(0n);
  const [roniteMaxSupply, setRoniteMaxSupply] = useState(0n);
  const [activeWallets, setActiveWallets] = useState<number | null>(null);

  const browserProviderRef = useRef<BrowserProvider | null>(null);
  const syncRef = useRef<Record<string, { pending: bigint; ts: number }>>({});

  // ── On-chain reads ──────────────────────────────────────────────────────
  const refreshNetwork = useCallback(async () => {
    if (BACKEND_URL) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/stats`);
        if (!res.ok) throw new Error("backend 502");
        const data = await res.json();
        setPools(prev => prev.map(p => {
          const d = data.pools?.find((x: { symbol: string }) => x.symbol === p.symbol);
          if (!d) return p;
          return { ...p,
            totalStaked:  BigInt(d.totalStaked),
            rewardRate:   BigInt(d.rewardRate),
            periodFinish: Number(d.periodFinish),
            miningActive: d.miningActive,
            rewardDecimals: d.rewardDecimals,
            globalMinted: d.globalMinted != null ? BigInt(d.globalMinted) : p.globalMinted,
          };
        }));
        if (typeof data.activeWallets === "number") setActiveWallets(data.activeWallets);
        return;
      } catch { /* fall through to direct RPC */ }
    }

    for (const pool of POOLS) {
      try {
        const staking     = new Contract(pool.stakingAddress, MINING_STAKING_ABI, readProvider);
        const rewardToken = new Contract(pool.rewardTokenAddress, ERC20_ABI, readProvider);
        const totalStaked  = await staking.totalStaked();
        const rewardRate   = await staking.rewardRate();
        const periodFinish = await staking.periodFinish();
        const decimals     = await rewardToken.decimals();
        const globalMinted = await rewardToken.totalSupply();
        setPools(prev => prev.map(p =>
          p.symbol !== pool.symbol ? p : {
            ...p, totalStaked, rewardRate,
            periodFinish: Number(periodFinish),
            miningActive: Date.now() / 1000 < Number(periodFinish),
            rewardDecimals: Number(decimals),
            globalMinted,
          }
        ));
      } catch (e) { console.warn(`refreshNetwork ${pool.symbol}:`, e); }
    }

    // RONITE global supply (public, no wallet needed)
    if (RONITE_ADDRESS) {
      try {
        const ronite = new Contract(RONITE_ADDRESS, RONITE_ABI, readProvider);
        const [supply, maxSup] = await Promise.all([
          ronite.totalSupply(),
          ronite.maxSupply(),
        ]);
        setRoniteSupply(supply);
        setRoniteMaxSupply(maxSup);
      } catch (e) { console.warn("refreshNetwork ronite supply:", e); }
    }
  }, []);

  const refreshMiner = useCallback(async (addr: string) => {
    // RON native balance
    try {
      const bal = await readProvider.getBalance(addr);
      setRonBalance(bal);
    } catch (e) { console.warn("refreshMiner ron balance:", e); }

    // RONITE balance
    if (RONITE_ADDRESS) {
      try {
        const ronite = new Contract(RONITE_ADDRESS, RONITE_ABI, readProvider);
        setRoniteBalance(await ronite.balanceOf(addr));
        const allowances: Record<string, bigint> = {};
        for (const pool of POOLS) {
          allowances[pool.symbol] = await ronite.allowance(addr, pool.stakingAddress);
        }
        setRoniteAllowance(allowances);
      } catch (e) { console.warn("refreshMiner ronite:", e); }
    }

    for (const pool of POOLS) {
      try {
        const staking = new Contract(pool.stakingAddress, MINING_STAKING_ABI, readProvider);
        const rewardToken = new Contract(pool.rewardTokenAddress, ERC20_ABI, readProvider);
        const staked        = await staking.stakedBalance(addr);
        const pendingReward = await staking.earned(addr);
        const oreBalance    = await rewardToken.balanceOf(addr);
        const lifetimeClaimed = getLifetimeClaimed(addr, pool.symbol);
        const totalMined    = oreBalance + lifetimeClaimed;
        syncRef.current[pool.symbol] = { pending: pendingReward, ts: Date.now() };
        setPools(prev => prev.map(p =>
          p.symbol !== pool.symbol ? p : { ...p, staked, pendingReward, liveReward: pendingReward, oreBalance, totalMined }
        ));
      } catch (e) { console.warn(`refreshMiner ${pool.symbol}:`, e); }
    }
  }, []);

  // Live ticker
  useEffect(() => {
    const id = setInterval(() => {
      setPools(prev => prev.map(p => {
        const sync = syncRef.current[p.symbol];
        if (!sync || p.staked === 0n || p.totalStaked === 0n) return p;
        const elapsedSec = (Date.now() - sync.ts) / 1000;
        const share   = (p.staked * p.rewardRate) / p.totalStaked;
        const accrued = BigInt(Math.floor(elapsedSec * Number(share)));
        return { ...p, liveReward: sync.pending + accrued };
      }));
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Polling
  useEffect(() => {
    refreshNetwork();
    const id = setInterval(refreshNetwork, 60_000);
    return () => clearInterval(id);
  }, [refreshNetwork]);

  useEffect(() => {
    if (!address) return;
    refreshMiner(address);
    const id = setInterval(() => refreshMiner(address), 60_000);
    return () => clearInterval(id);
  }, [address, refreshMiner]);

  // ── Wallet connection ────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setError(null); setConnecting(true);
    try {
      const { provider, address: addr } = await connectWallet();
      browserProviderRef.current = provider;
      setAddress(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally { setConnecting(false); }
  }, []);

  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected) return;
    injected.request({ method: "eth_accounts" }).then((accounts) => {
      if (Array.isArray(accounts) && accounts.length > 0) connect();
    }).catch(() => undefined);
  }, [connect]);

  // ── Actions ──────────────────────────────────────────────────────────────
  async function runAction(label: string, fn: () => Promise<unknown>) {
    setError(null); setPendingAction(label);
    try {
      const tx = (await fn()) as { wait?: () => Promise<unknown> };
      if (tx?.wait) await tx.wait();
      if (address) await refreshMiner(address);
      await refreshNetwork();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed: ${label}`);
    } finally { setPendingAction(null); }
  }

  async function getSigner() {
    if (!browserProviderRef.current || !address) throw new Error("Connect wallet first");
    return browserProviderRef.current.getSigner();
  }

  // Buy RONITE with RON
  const buyRonite = useCallback(async (ronAmount: string) => {
    if (!RONITE_ADDRESS) return;
    const signer = await getSigner();
    const ronite = new Contract(RONITE_ADDRESS, RONITE_ABI, signer);
    await runAction("buyRonite", () =>
      ronite.buy({ value: parseEther(ronAmount) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const approveRonite = useCallback(async (poolSymbol: string, amount: string) => {
    const pool = POOLS.find(p => p.symbol === poolSymbol);
    if (!pool || !RONITE_ADDRESS) return;
    const signer = await getSigner();
    const ronite = new Contract(RONITE_ADDRESS, ERC20_ABI, signer);
    await runAction(`approve-${poolSymbol}`, () =>
      ronite.approve(pool.stakingAddress, toTokenUnits(amount, 18))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const stake = useCallback(async (poolSymbol: string, amount: string) => {
    const pool = POOLS.find(p => p.symbol === poolSymbol);
    if (!pool) return;
    const signer  = await getSigner();
    const staking = new Contract(pool.stakingAddress, MINING_STAKING_ABI, signer);
    await runAction(`stake-${poolSymbol}`, () =>
      staking.stake(toTokenUnits(amount, 18))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const withdraw = useCallback(async (poolSymbol: string, amount: string) => {
    const pool = POOLS.find(p => p.symbol === poolSymbol);
    if (!pool) return;
    const signer  = await getSigner();
    const staking = new Contract(pool.stakingAddress, MINING_STAKING_ABI, signer);
    await runAction(`withdraw-${poolSymbol}`, () =>
      staking.withdraw(toTokenUnits(amount, 18))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const claim = useCallback(async (poolSymbol: string) => {
    const pool = POOLS.find(p => p.symbol === poolSymbol);
    if (!pool || !address) return;
    const poolState = pools.find(p => p.symbol === poolSymbol);
    const pendingAmt = poolState?.pendingReward ?? 0n;
    const signer  = await getSigner();
    const staking = new Contract(pool.stakingAddress, MINING_STAKING_ABI, signer);
    await runAction(`claim-${poolSymbol}`, () => staking.getReward());
    if (pendingAmt > 0n) addLifetimeClaimed(address, poolSymbol, pendingAmt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, pools]);

  const claimAll = useCallback(async () => {
    for (const pool of POOLS) {
      const poolState = pools.find(p => p.symbol === pool.symbol);
      if (!poolState || poolState.pendingReward === 0n) continue;
      const pendingAmt = poolState.pendingReward;
      const signer  = await getSigner();
      const staking = new Contract(pool.stakingAddress, MINING_STAKING_ABI, signer);
      await runAction(`claim-${pool.symbol}`, () => staking.getReward());
      if (address && pendingAmt > 0n) addLifetimeClaimed(address, pool.symbol, pendingAmt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, pools]);

  // ── Sell Ore → RONITE ───────────────────────────────────────────────────
  // How many ore tokens (full units) equal 1 RONITE
  const ORE_PER_RONITE: Record<string, bigint> = {
    COAL:    1000n,
    IRON:     100n,
    GOLD:      50n,
    DIAMOND:  100n,
  };

  const sellOre = useCallback(async (poolSymbol: string, amount: string) => {
    const pool = POOLS.find(p => p.symbol === poolSymbol);
    if (!pool) return;

    const marketAddress = pool.oreMarketAddress;
    if (!marketAddress) {
      setError(`Market contract not set for ${poolSymbol}. Add VITE_${poolSymbol}_MARKET_ADDRESS to frontend/.env`);
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setError("Enter a valid amount");
      return;
    }

    const rate = ORE_PER_RONITE[poolSymbol] ?? 1000n;
    const amtWei = toTokenUnits(amount, 18);
    const roniteOut = amtWei / rate;

    if (roniteOut === 0n) {
      setError(`Minimum sell: ${rate.toString()} ${poolSymbol} to receive 1 RONITE`);
      return;
    }

    setError(null);
    const signer   = await getSigner();
    const oreToken = new Contract(pool.rewardTokenAddress, ERC20_ABI, signer);
    const market   = new Contract(marketAddress, ORE_MARKET_ABI, signer);

    // --- Step 1: Approve ---
    setPendingAction(`approve-sell-${poolSymbol}`);
    try {
      const currentAllowance: bigint = await oreToken.allowance(address, marketAddress);
      if (currentAllowance < amtWei) {
        const approveTx = await oreToken.approve(marketAddress, amtWei);
        await approveTx.wait();
      }
    } catch (e) {
      setError(`Approve failed: ${e instanceof Error ? e.message : String(e)}`);
      setPendingAction(null);
      return;
    }

    // --- Step 2: Sell ---
    setPendingAction(`sell-${poolSymbol}`);
    try {
      await market.sell.estimateGas(amtWei);
      const sellTx = await market.sell(amtWei);
      await sellTx.wait();
      if (address) await refreshMiner(address);
      await refreshNetwork();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("InsufficientRonite")) {
        setError(`Market is out of RONITE. Please contact admin to refill ${poolSymbol} market.`);
      } else if (msg.includes("MarketIsPaused")) {
        setError(`${poolSymbol} market is currently paused.`);
      } else if (msg.includes("NotEnoughOre")) {
        setError(`Minimum sell is ${rate.toString()} ${poolSymbol} (= 1 RONITE).`);
      } else if (msg.includes("ZeroAmount")) {
        setError("Amount cannot be zero.");
      } else {
        setError(`Sell failed: ${msg.slice(0, 120)}`);
      }
    } finally {
      setPendingAction(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, refreshMiner, refreshNetwork]);

  return {
    address, connecting, pendingAction, error,
    pools, roniteBalance, roniteAllowance,
    ronBalance, roniteSupply, roniteMaxSupply, activeWallets,
    connect, buyRonite, approveRonite, stake, withdraw, claim, claimAll, sellOre,
  };
}
