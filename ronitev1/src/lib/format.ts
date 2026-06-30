import { formatUnits, parseUnits } from "ethers";

export function formatTokenAmount(raw: bigint, decimals: number, fractionDigits = 4): string {
  const value = Number(formatUnits(raw, decimals));
  return value.toLocaleString("en-US", { maximumFractionDigits: fractionDigits });
}

/** High-precision formatter for the live-ticking counter, so small per-second
 * increments are still visible. */
export function formatTokenAmountPrecise(raw: bigint, decimals: number): string {
  const value = Number(formatUnits(raw, decimals));
  return value.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export function toTokenUnits(amount: string, decimals: number): bigint {
  return parseUnits(amount || "0", decimals);
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((unit) => String(unit).padStart(2, "0")).join(":");
}

/** Compact big-number formatter for headline stats: 1.2K / 3.4M / 5.6B. */
export function formatCompact(value: number): string {
  if (!isFinite(value)) return "0";
  const abs = Math.abs(value);
  if (abs >= 1e9) return (value / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  if (abs >= 1e6) return (value / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (abs >= 1e3) return (value / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Compact formatter for raw bigint token amounts (handles decimals first). */
export function formatTokenAmountCompact(raw: bigint, decimals: number): string {
  return formatCompact(Number(formatUnits(raw, decimals)));
}

export function formatUsd(value: number, compact = true): string {
  if (!isFinite(value)) return "$0";
  if (compact && Math.abs(value) >= 1000) return "$" + formatCompact(value);
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 6 : 2 });
}
