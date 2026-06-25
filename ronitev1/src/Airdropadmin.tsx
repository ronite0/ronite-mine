
import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, parseEther, formatUnits } from "ethers";

const RONIN_RPC  = "https://ronin.drpc.org";
const CHAIN_ID   = 2020;
const EXPLORER   = "https://explorer.roninchain.com";

const AIRDROP_ADDR = import.meta.env.VITE_AIRDROP_CONTRACT_ADDRESS as string | undefined;
const RONITE_ADDR  = import.meta.env.VITE_RONITE_TOKEN_ADDRESS     as string | undefined;

const AIRDROP_ABI = [
  // views
  "function owner() view returns (address)",
  "function claimStart() view returns (uint256)",
  "function claimEnd() view returns (uint256)",
  "function isCampaignOpen() view returns (bool)",
  "function totalAllocated() view returns (uint256)",
  "function totalClaimed() view returns (uint256)",
  "function remainingBalance() view returns (uint256)",
  "function submitterCount() view returns (uint256)",
  "function SUBMIT_FEE() view returns (uint256)",
  "function RONITE_PER_POINT() view returns (uint256)",
  "function MAX_ALLOCATION_PER_WALLET() view returns (uint256)",
  "function getSubmitters(uint256 offset, uint256 limit) view returns (address[])",
  "function getSubmission(address wallet) view returns (bool exists, uint256 earned, string tier, string taskIds, uint256 submittedAt)",
  "function allocation(address) view returns (uint256)",
  "function claimed(address) view returns (bool)",
  // owner write
  "function openCampaign(uint256 start, uint256 end)",
  "function setAllocation(address wallet, uint256 amount)",
  "function batchSetAllocation(address[] wallets, uint256[] amounts)",
  "function setRonitePerPoint(uint256 newRate)",
  "function setMaxAllocationPerWallet(uint256 newMax)",
  "function setSubmitFee(uint256 newFee)",
  "function withdrawFees(address to)",
  "function sweep(address to)",
  "function emergencyWithdraw(address to)",
  "function transferOwnership(address newOwner)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const readProvider = new JsonRpcProvider(
  RONIN_RPC,
  { chainId: CHAIN_ID, name: "ronin" },
  { staticNetwork: true, batchMaxCount: 1 },
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractState {
  owner: string;
  claimStart: number;
  claimEnd: number;
  isOpen: boolean;
  totalAllocated: bigint;
  totalClaimed: bigint;
  remaining: bigint;
  submitterCount: number;
  submitFee: bigint;
  ronitePerPoint: bigint;
  maxAllocPerWallet: bigint;
  roniteBalance: bigint; // contract's RONITE balance
}

interface SubmitterRow {
  address: string;
  earned: number;
  tier: string;
  taskIds: string;
  submittedAt: number;
  allocation: bigint;
  claimed: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt18 = (v: bigint, dp = 2) =>
  Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: dp });

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

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

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      flex: "1 1 120px",
      background: "var(--ronin-dark)", border: "2px solid var(--border)",
      boxShadow: "2px 2px 0 #000", padding: "10px 12px",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "5.5px", color: "var(--text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "8px", color: color ?? "var(--ore)", textShadow: "1px 1px 0 #000", wordBreak: "break-word" as const }}>
        {value}
      </div>
    </div>
  );
}

function TxResult({ hash, error }: { hash: string | null; error: string | null }) {
  if (!hash && !error) return null;
  if (error) return (
    <div style={{ padding: "8px 12px", border: "2px solid var(--danger)", background: "rgba(239,68,68,0.08)", fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--danger)", lineHeight: 2 }}>
      ❌ {error}
    </div>
  );
  return (
    <div style={{ padding: "8px 12px", border: "2px solid var(--success)", background: "rgba(34,197,94,0.08)", fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--success)" }}>
      ✅ TX:{" "}
      <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ronin-sky)" }}>
        {hash!.slice(0, 14)}…{hash!.slice(-8)} ↗
      </a>
    </div>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function OpenCampaignPanel({ signer, onDone }: { signer: any; onDone: () => void }) {
  const [startType, setStartType] = useState<"now" | "custom">("now");
  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [loading, setLoading] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleOpen() {
    if (!AIRDROP_ADDR) return;
    setLoading(true); setErr(null); setTx(null);
    try {
      const c = new Contract(AIRDROP_ADDR, AIRDROP_ABI, signer);
      const start = startType === "now"
        ? Math.floor(Date.now() / 1000)
        : Math.floor(new Date(startDate).getTime() / 1000);
      const end = endDate
        ? Math.floor(new Date(endDate).getTime() / 1000)
        : 0;
      const t = await c.openCampaign(start, end);
      setTx(t.hash);
      await t.wait();
      onDone();
    } catch (e: any) {
      setErr(e?.reason ?? e?.shortMessage ?? e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PixelBox style={{ padding: "18px 20px" }}>
      <SectionLabel>🚀 Open Campaign</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>

        {/* Start time */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)", marginBottom: 6 }}>Start Time</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["now", "custom"] as const).map(t => (
              <button key={t} onClick={() => setStartType(t)} style={{
                background: startType === t ? "rgba(37,99,235,0.2)" : "transparent",
                border: `2px solid ${startType === t ? "var(--accent)" : "var(--border)"}`,
                color: startType === t ? "var(--ronin-sky)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)", fontSize: "6px",
                padding: "5px 12px", cursor: "pointer",
              }}>
                {t === "now" ? "Now" : "Custom"}
              </button>
            ))}
          </div>
          {startType === "custom" && (
            <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ marginTop: 8, width: "100%", background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }}
            />
          )}
        </div>

        {/* End time */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)", marginBottom: 6 }}>
            End Time <span style={{ color: "var(--text-muted)", opacity: 0.6 }}>(kosongkan = tidak ada deadline)</span>
          </div>
          <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)}
            style={{ width: "100%", background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }}
          />
        </div>

        <TxResult hash={tx} error={err} />

        <button onClick={handleOpen} disabled={loading}
          style={{
            background: loading ? "transparent" : "rgba(34,197,94,0.15)",
            border: "2px solid var(--success)", color: "var(--success)",
            fontFamily: "var(--font-display)", fontSize: "8px",
            padding: "12px 0", cursor: loading ? "wait" : "pointer",
            boxShadow: loading ? "none" : "3px 3px 0 #000",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "⏳ Opening…" : "🚀 Open Campaign"}
        </button>
      </div>
    </PixelBox>
  );
}

function FundPanel({ signer, contractAddr, onDone }: { signer: any; contractAddr: string; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [tx, setTx]     = useState<string | null>(null);
  const [err, setErr]   = useState<string | null>(null);
  const [walletBal, setWalletBal] = useState<bigint | null>(null);
  const [needsApprove, setNeedsApprove] = useState(false);

  useEffect(() => {
    if (!RONITE_ADDR || !signer) return;
    (async () => {
      const addr = await signer.getAddress();
      const c = new Contract(RONITE_ADDR, ERC20_ABI, readProvider);
      const [bal, allowance] = await Promise.all([
        c.balanceOf(addr) as Promise<bigint>,
        c.allowance(addr, contractAddr) as Promise<bigint>,
      ]);
      setWalletBal(bal);
      const amt = amount ? parseEther(amount) : 0n;
      setNeedsApprove(allowance < amt);
    })();
  }, [signer, amount, contractAddr]);

  async function handleApprove() {
    if (!RONITE_ADDR) return;
    setLoading(true); setErr(null); setTx(null);
    try {
      const c = new Contract(RONITE_ADDR, ERC20_ABI, signer);
      const t = await c.approve(contractAddr, parseEther(amount || "0"));
      setTx(t.hash);
      await t.wait();
      setNeedsApprove(false);
    } catch (e: any) {
      setErr(e?.reason ?? e?.message ?? "Failed");
    } finally { setLoading(false); }
  }

  async function handleTransfer() {
    if (!RONITE_ADDR) return;
    setLoading(true); setErr(null); setTx(null);
    try {
      const c = new Contract(RONITE_ADDR, ERC20_ABI, signer);
      const t = await c.transfer(contractAddr, parseEther(amount || "0"));
      setTx(t.hash);
      await t.wait();
      onDone();
    } catch (e: any) {
      setErr(e?.reason ?? e?.message ?? "Failed");
    } finally { setLoading(false); }
  }

  return (
    <PixelBox style={{ padding: "18px 20px" }}>
      <SectionLabel>💰 Fund Contract with RONITE</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>
        {walletBal !== null && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)" }}>
            Wallet balance: <span style={{ color: "var(--ore)" }}>{fmt18(walletBal)} RONITE</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="Amount RONITE…"
            style={{ flex: 1, background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }}
          />
          {needsApprove ? (
            <button onClick={handleApprove} disabled={loading || !amount}
              style={{ background: "rgba(245,158,11,0.15)", border: "2px solid var(--ore)", color: "var(--ore)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
              {loading ? "⏳" : "Approve"}
            </button>
          ) : (
            <button onClick={handleTransfer} disabled={loading || !amount}
              style={{ background: "rgba(34,197,94,0.12)", border: "2px solid var(--success)", color: "var(--success)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
              {loading ? "⏳" : "Send"}
            </button>
          )}
        </div>
        <TxResult hash={tx} error={err} />
      </div>
    </PixelBox>
  );
}

function SubmitterTable({ signer }: { signer: any }) {
  const [rows, setRows]         = useState<SubmitterRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [overrideAddr, setOverrideAddr] = useState("");
  const [overrideAmt,  setOverrideAmt]  = useState("");
  const [overrideTx,   setOverrideTx]   = useState<string | null>(null);
  const [overrideErr,  setOverrideErr]  = useState<string | null>(null);
  const [ovLoading,    setOvLoading]    = useState(false);

  const load = useCallback(async () => {
    if (!AIRDROP_ADDR) return;
    setLoading(true);
    try {
      const c = new Contract(AIRDROP_ADDR, AIRDROP_ABI, readProvider);
      const count = Number(await c.submitterCount());
      if (count === 0) { setRows([]); setLoading(false); return; }

      const addrs: string[] = await c.getSubmitters(0, count);
      const rowData = await Promise.all(addrs.map(async (addr) => {
        const [sub, alloc, clmd] = await Promise.all([
          c.getSubmission(addr) as Promise<[boolean, bigint, string, string, bigint]>,
          c.allocation(addr)    as Promise<bigint>,
          c.claimed(addr)       as Promise<boolean>,
        ]);
        return {
          address: addr,
          earned: Number(sub[1]),
          tier: sub[2],
          taskIds: sub[3],
          submittedAt: Number(sub[4]),
          allocation: alloc,
          claimed: clmd,
        } as SubmitterRow;
      }));
      setRows(rowData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleOverride() {
    if (!AIRDROP_ADDR || !overrideAddr || !overrideAmt) return;
    setOvLoading(true); setOverrideTx(null); setOverrideErr(null);
    try {
      const c = new Contract(AIRDROP_ADDR, AIRDROP_ABI, signer);
      const t = await c.setAllocation(overrideAddr, parseEther(overrideAmt));
      setOverrideTx(t.hash);
      await t.wait();
      await load();
    } catch (e: any) {
      setOverrideErr(e?.reason ?? e?.message ?? "Failed");
    } finally { setOvLoading(false); }
  }

  return (
    <PixelBox style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <SectionLabel>📋 Submitters ({rows.length})</SectionLabel>
        <button onClick={load} disabled={loading} style={{ background: "transparent", border: "2px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "5.5px", padding: "4px 10px", cursor: "pointer" }}>
          {loading ? "⏳" : "🔄 Refresh"}
        </button>
      </div>

      {loading && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)", padding: "16px 0" }}>⏳ Loading submitters…</div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)", padding: "16px 0" }}>No submitters yet.</div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto" as const }}>
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: "var(--font-mono)", fontSize: "5.5px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                {["Wallet", "Tier", "Earned", "Allocation", "Claimed", "Submitted", "Tasks"].map(h => (
                  <th key={h} style={{ padding: "6px 10px", textAlign: "left" as const, color: "var(--text-muted)", whiteSpace: "nowrap", fontWeight: "normal" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.address} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.2)" }}>
                  <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                    <a href={`${EXPLORER}/address/${r.address}`} target="_blank" rel="noopener noreferrer" style={{ color: "var(--ronin-sky)", textDecoration: "none" }}>
                      {short(r.address)}
                    </a>
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--ore)", whiteSpace: "nowrap" }}>{r.tier}</td>
                  <td style={{ padding: "6px 10px", color: "var(--text)" }}>{r.earned}</td>
                  <td style={{ padding: "6px 10px", color: "var(--success)" }}>{fmt18(r.allocation)} RONITE</td>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{ color: r.claimed ? "var(--success)" : "var(--text-muted)" }}>
                      {r.claimed ? "✅" : "—"}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(r.submittedAt * 1000).toLocaleDateString("id-ID")}
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.taskIds}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Override allocation */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "2px solid var(--border)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)", marginBottom: 8 }}>
          ✏️ Override Allocation (sybil penalty / manual bonus)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <input value={overrideAddr} onChange={e => setOverrideAddr(e.target.value)}
            placeholder="0x wallet address…"
            style={{ flex: 2, minWidth: 160, background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }}
          />
          <input value={overrideAmt} onChange={e => setOverrideAmt(e.target.value)}
            placeholder="RONITE amount…"
            style={{ flex: 1, minWidth: 80, background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }}
          />
          <button onClick={handleOverride} disabled={ovLoading || !overrideAddr || !overrideAmt}
            style={{ background: "rgba(239,68,68,0.12)", border: "2px solid var(--danger)", color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            {ovLoading ? "⏳" : "Set"}
          </button>
        </div>
        <TxResult hash={overrideTx} error={overrideErr} />
      </div>
    </PixelBox>
  );
}

function ConfigPanel({ signer, state, onDone }: { signer: any; state: ContractState; onDone: () => void }) {
  const [fee, setFee]     = useState("");
  const [rate, setRate]   = useState("");
  const [cap, setCap]     = useState("");
  const [tx, setTx]       = useState<string | null>(null);
  const [err, setErr]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function callOwner(fn: () => Promise<any>) {
    setLoading(true); setTx(null); setErr(null);
    try {
      const t = await fn();
      setTx(t.hash);
      await t.wait();
      onDone();
    } catch (e: any) {
      setErr(e?.reason ?? e?.message ?? "Failed");
    } finally { setLoading(false); }
  }

  const c = () => new Contract(AIRDROP_ADDR!, AIRDROP_ABI, signer);

  return (
    <PixelBox style={{ padding: "18px 20px" }}>
      <SectionLabel>⚙️ Config</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>

        {/* Current values */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <Stat label="Submit Fee" value={`${fmt18(state.submitFee, 4)} RON`} color="var(--ronin-sky)" />
          <Stat label="RONITE/Point" value={`${fmt18(state.ronitePerPoint)} RONITE`} color="var(--ore)" />
          <Stat label="Max/Wallet" value={`${fmt18(state.maxAllocPerWallet)} RONITE`} color="var(--success)" />
        </div>

        {/* Set fee */}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={fee} onChange={e => setFee(e.target.value)} placeholder="New fee (RON)…"
            style={{ flex: 1, background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }} />
          <button onClick={() => callOwner(() => c().setSubmitFee(parseEther(fee || "0")))} disabled={loading || !fee}
            style={{ background: "transparent", border: "2px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            Set Fee
          </button>
        </div>

        {/* Set rate */}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={rate} onChange={e => setRate(e.target.value)} placeholder="RONITE per point…"
            style={{ flex: 1, background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }} />
          <button onClick={() => callOwner(() => c().setRonitePerPoint(parseEther(rate || "0")))} disabled={loading || !rate}
            style={{ background: "transparent", border: "2px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            Set Rate
          </button>
        </div>

        {/* Set cap */}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={cap} onChange={e => setCap(e.target.value)} placeholder="Max RONITE per wallet…"
            style={{ flex: 1, background: "var(--ronin-dark)", border: "2px solid var(--border)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }} />
          <button onClick={() => callOwner(() => c().setMaxAllocationPerWallet(parseEther(cap || "0")))} disabled={loading || !cap}
            style={{ background: "transparent", border: "2px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            Set Cap
          </button>
        </div>

        <TxResult hash={tx} error={err} />
      </div>
    </PixelBox>
  );
}

function DangerPanel({ signer, state, address }: { signer: any; state: ContractState; address: string }) {
  const [tx, setTx]   = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [newOwner, setNewOwner] = useState("");

  async function callOwner(fn: () => Promise<any>) {
    setLoading(true); setTx(null); setErr(null);
    try {
      const t = await fn();
      setTx(t.hash);
      await t.wait();
    } catch (e: any) {
      setErr(e?.reason ?? e?.message ?? "Failed");
    } finally { setLoading(false); }
  }

  const c = () => new Contract(AIRDROP_ADDR!, AIRDROP_ABI, signer);
  const campaignEnded = state.claimEnd > 0 && Date.now() / 1000 > state.claimEnd;

  return (
    <PixelBox style={{ padding: "18px 20px", borderColor: "var(--danger)" }}>
      <SectionLabel>⚠️ Danger Zone</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 10 }}>

        {/* Withdraw RON fees */}
        <button onClick={() => callOwner(() => c().withdrawFees(address))} disabled={loading}
          style={{ background: "rgba(96,165,250,0.1)", border: "2px solid var(--accent)", color: "var(--ronin-sky)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "8px 14px", cursor: "pointer", textAlign: "left" as const }}>
          💸 Withdraw RON Fees → My Wallet
        </button>

        {/* Emergency withdraw (before campaign) */}
        {state.claimStart === 0 && (
          <button onClick={() => { if (confirm("Emergency withdraw RONITE sebelum campaign?")) callOwner(() => c().emergencyWithdraw(address)); }} disabled={loading}
            style={{ background: "rgba(239,68,68,0.1)", border: "2px solid var(--danger)", color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "8px 14px", cursor: "pointer", textAlign: "left" as const }}>
            🚨 Emergency Withdraw RONITE (pre-campaign)
          </button>
        )}

        {/* Sweep (after campaign ends) */}
        {campaignEnded && (
          <button onClick={() => { if (confirm("Sweep sisa RONITE ke wallet owner?")) callOwner(() => c().sweep(address)); }} disabled={loading}
            style={{ background: "rgba(239,68,68,0.1)", border: "2px solid var(--danger)", color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "8px 14px", cursor: "pointer", textAlign: "left" as const }}>
            🧹 Sweep Unclaimed RONITE (post-campaign)
          </button>
        )}

        {/* Transfer ownership */}
        <div style={{ display: "flex", gap: 8 }}>
          <input value={newOwner} onChange={e => setNewOwner(e.target.value)} placeholder="New owner 0x…"
            style={{ flex: 1, background: "var(--ronin-dark)", border: "2px solid var(--danger)", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 8px" }} />
          <button onClick={() => { if (confirm(`Transfer ownership ke ${newOwner}?`)) callOwner(() => c().transferOwnership(newOwner)); }} disabled={loading || !newOwner}
            style={{ background: "transparent", border: "2px solid var(--danger)", color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "6px", padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
            Transfer Owner
          </button>
        </div>

        <TxResult hash={tx} error={err} />
      </div>
    </PixelBox>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AirdropAdminPage() {
  const [address,  setAddress]  = useState<string | null>(null);
  const [signer,   setSigner]   = useState<any>(null);
  const [connecting, setConnecting] = useState(false);
  const [isOwner,  setIsOwner]  = useState<boolean | null>(null);
  const [state,    setState]    = useState<ContractState | null>(null);
  const [stateErr, setStateErr] = useState<string | null>(null);
  const [refresh,  setRefresh]  = useState(0);

  // ── Connect ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    const injected = (window as any).ronin?.provider ?? (window as any).ethereum;
    if (!injected) { alert("Install Ronin Wallet"); return; }
    setConnecting(true);
    try {
      await injected.request({ method: "eth_requestAccounts" });
      try { await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x7e4" }] }); } catch {}
      const provider = new BrowserProvider(injected);
      const s = await provider.getSigner();
      const addr = await s.getAddress();
      setAddress(addr);
      setSigner(s);
    } catch {} finally { setConnecting(false); }
  }, []);

  useEffect(() => {
    const injected = (window as any).ronin?.provider ?? (window as any).ethereum;
    if (!injected) return;
    injected.request({ method: "eth_accounts" }).then((a: string[]) => { if (a[0]) connect(); }).catch(() => {});
  }, [connect]);

  // ── Load state ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!AIRDROP_ADDR || !address) return;
    (async () => {
      setStateErr(null);
      try {
        const c = new Contract(AIRDROP_ADDR, AIRDROP_ABI, readProvider);
        const [
          ownerAddr, claimStart, claimEnd, isOpen,
          totAlloc, totClaimed, remaining, submCount,
          submitFee, ronitePerPt, maxAlloc, ronBal,
        ] = await Promise.all([
          c.owner()                    as Promise<string>,
          c.claimStart()               as Promise<bigint>,
          c.claimEnd()                 as Promise<bigint>,
          c.isCampaignOpen()           as Promise<boolean>,
          c.totalAllocated()           as Promise<bigint>,
          c.totalClaimed()             as Promise<bigint>,
          c.remainingBalance()         as Promise<bigint>,
          c.submitterCount()           as Promise<bigint>,
          c.SUBMIT_FEE()               as Promise<bigint>,
          c.RONITE_PER_POINT()         as Promise<bigint>,
          c.MAX_ALLOCATION_PER_WALLET() as Promise<bigint>,
          RONITE_ADDR
            ? new Contract(RONITE_ADDR, ERC20_ABI, readProvider).balanceOf(AIRDROP_ADDR) as Promise<bigint>
            : Promise.resolve(0n),
        ]);

        setState({
          owner: ownerAddr,
          claimStart: Number(claimStart),
          claimEnd: Number(claimEnd),
          isOpen,
          totalAllocated: totAlloc,
          totalClaimed: totClaimed,
          remaining,
          submitterCount: Number(submCount),
          submitFee,
          ronitePerPoint: ronitePerPt,
          maxAllocPerWallet: maxAlloc,
          roniteBalance: ronBal,
        });
        setIsOwner(ownerAddr.toLowerCase() === address.toLowerCase());
      } catch (e: any) {
        setStateErr(e?.message ?? "Failed to load contract state");
      }
    })();
  }, [address, refresh]);

  const doRefresh = () => setRefresh(n => n + 1);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="grid-backdrop" aria-hidden="true" />

      {/* Topbar */}
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button className="btn btn--docs" onClick={() => { window.location.hash = "#airdrop"; }}>← Airdrop</button>
          <div className="brand">
            <span className="brand-mark">🛠</span>
            <span className="brand-name">ADMIN PANEL</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--danger)", marginLeft: 6 }}>OWNER ONLY</span>
          </div>
        </div>
        <div className="topbar-right">
          {address ? (
            <div className="wallet-chip">
              <span className="status-dot status-dot--live" />
              <span className="mono">{address.slice(0, 6)}…{address.slice(-4)}</span>
              {isOwner !== null && (
                <span style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: "5.5px", color: isOwner ? "var(--success)" : "var(--danger)" }}>
                  {isOwner ? "✅ Owner" : "❌ Not Owner"}
                </span>
              )}
            </div>
          ) : (
            <button className="btn btn--primary" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </header>

      <main className="content" style={{ maxWidth: 760 }}>

        {/* Not configured */}
        {!AIRDROP_ADDR && (
          <PixelBox style={{ padding: "20px", borderColor: "var(--danger)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "6.5px", color: "var(--danger)" }}>
              ❌ VITE_AIRDROP_CONTRACT_ADDRESS not set in .env
            </div>
          </PixelBox>
        )}

        {/* Not connected */}
        {AIRDROP_ADDR && !address && (
          <PixelBox style={{ padding: "32px", textAlign: "center" as const }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🔒</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "7px", color: "var(--text-muted)", marginBottom: 20 }}>
              Connect owner wallet to access admin panel
            </div>
            <button className="btn btn--primary" onClick={connect} disabled={connecting} style={{ fontSize: "8px", padding: "12px 24px" }}>
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          </PixelBox>
        )}

        {/* Not owner */}
        {address && isOwner === false && (
          <PixelBox style={{ padding: "20px", borderColor: "var(--danger)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "6.5px", color: "var(--danger)", lineHeight: 2 }}>
              ❌ Wallet <strong>{address.slice(0, 8)}…</strong> bukan owner contract.<br />
              Owner: <strong>{state?.owner}</strong>
            </div>
          </PixelBox>
        )}

        {stateErr && (
          <PixelBox style={{ padding: "14px", borderColor: "var(--danger)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--danger)" }}>⚠ {stateErr}</div>
          </PixelBox>
        )}

        {/* Admin content */}
        {address && isOwner === true && state && (
          <>
            {/* Stats overview */}
            <PixelBox style={{ padding: "18px 20px" }}>
              <SectionLabel>📊 Contract Overview</SectionLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 12 }}>
                <Stat label="Campaign" value={
                  state.isOpen ? "🟢 OPEN" :
                  state.claimStart === 0 ? "⚫ NOT OPENED" :
                  state.claimEnd > 0 && Date.now() / 1000 > state.claimEnd ? "🔴 ENDED" : "🟡 PENDING"
                } color={state.isOpen ? "var(--success)" : state.claimStart === 0 ? "var(--text-muted)" : "var(--danger)"} />
                <Stat label="RONITE in Contract" value={`${fmt18(state.roniteBalance)} RONITE`} />
                <Stat label="Total Allocated" value={`${fmt18(state.totalAllocated)} RONITE`} />
                <Stat label="Total Claimed" value={`${fmt18(state.totalClaimed)} RONITE`} />
                <Stat label="Submitters" value={state.submitterCount.toString()} color="var(--ronin-sky)" />
              </div>
              {state.claimStart > 0 && (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "6px", color: "var(--text-muted)", lineHeight: 2 }}>
                  Start: {new Date(state.claimStart * 1000).toLocaleString("id-ID")}
                  {state.claimEnd > 0 && <> &nbsp;·&nbsp; End: {new Date(state.claimEnd * 1000).toLocaleString("id-ID")}</>}
                </div>
              )}
              <button onClick={doRefresh} style={{ marginTop: 10, background: "transparent", border: "2px solid var(--border)", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "5.5px", padding: "4px 10px", cursor: "pointer" }}>
                🔄 Refresh
              </button>
            </PixelBox>

            {/* Fund contract */}
            {RONITE_ADDR && (
              <FundPanel signer={signer} contractAddr={AIRDROP_ADDR!} onDone={doRefresh} />
            )}

            {/* Open campaign */}
            {state.claimStart === 0 && (
              <OpenCampaignPanel signer={signer} onDone={doRefresh} />
            )}

            {/* Submitter table */}
            <SubmitterTable signer={signer} />

            {/* Config */}
            <ConfigPanel signer={signer} state={state} onDone={doRefresh} />

            {/* Danger zone */}
            <DangerPanel signer={signer} state={state} address={address} />
          </>
        )}

      </main>

      <footer className="footer">
        Admin Panel · RoniteAirdrop Season 1 · Ronin Mainnet · Chain ID 2020
      </footer>
    </div>
  );
}

export default AirdropAdminPage;
