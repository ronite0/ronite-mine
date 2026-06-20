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
