export const RONIN_MAINNET = {
  chainId: 2020,
  chainIdHex: "0x7e4",
  chainName: "Ronin",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: ["https://ronin.drpc.org"],
  blockExplorerUrls: ["https://explorer.roninchain.com"],
};

export const RONITE_ADDRESS = import.meta.env.VITE_RONITE_TOKEN_ADDRESS as string;
export const BACKEND_URL    = (import.meta.env.VITE_BACKEND_URL as string) || "";

// ── Price source (GeckoTerminal) ────────────────────────────────────────────
// RONITE / WRON pool on Ronin. Used for the live TVL→USD estimate and the
// embedded price chart modal on the landing page.
export const GECKOTERMINAL_NETWORK      = "ronin";
export const GECKOTERMINAL_POOL_ADDRESS = "0x591bf4bcb12ca203e2f8510a7c2c63d5a5c97fd4";
export const GECKOTERMINAL_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/pools/${GECKOTERMINAL_POOL_ADDRESS}`;
export const GECKOTERMINAL_POOL_URL =
  `https://www.geckoterminal.com/${GECKOTERMINAL_NETWORK}/pools/${GECKOTERMINAL_POOL_ADDRESS}`;
export const GECKOTERMINAL_EMBED_URL =
  `${GECKOTERMINAL_POOL_URL}?embed=1&info=0&swaps=1&grayscale=0&light_chart=0&chart_type=price&resolution=30s`;

export interface PoolConfig {
  symbol:             string;
  name:               string;
  rarity:             "common" | "uncommon" | "rare" | "legendary";
  color:              string;
  stakingAddress:     string;
  rewardTokenAddress: string;
  oreMarketAddress?:  string;
}

export const POOLS: PoolConfig[] = (
  [
    {
      symbol:             "COAL",
      name:               "Coal Mine",
      rarity:             "common" as const,
      color:              "#94a3b8",
      stakingAddress:     import.meta.env.VITE_COAL_STAKING_ADDRESS,
      rewardTokenAddress: import.meta.env.VITE_COAL_REWARD_TOKEN_ADDRESS,
      oreMarketAddress:   import.meta.env.VITE_COAL_MARKET_ADDRESS,
    },
    {
      symbol:             "IRON",
      name:               "Iron Forge",
      rarity:             "uncommon" as const,
      color:              "#cbd5e1",
      stakingAddress:     import.meta.env.VITE_IRON_STAKING_ADDRESS,
      rewardTokenAddress: import.meta.env.VITE_IRON_REWARD_TOKEN_ADDRESS,
      oreMarketAddress:   import.meta.env.VITE_IRON_MARKET_ADDRESS,
    },
    {
      symbol:             "GOLD",
      name:               "Gold Rush",
      rarity:             "rare" as const,
      color:              "#f2b84b",
      stakingAddress:     import.meta.env.VITE_GOLD_STAKING_ADDRESS,
      rewardTokenAddress: import.meta.env.VITE_GOLD_REWARD_TOKEN_ADDRESS,
      oreMarketAddress:   import.meta.env.VITE_GOLD_MARKET_ADDRESS,
    },
    {
      symbol:             "DIAMOND",
      name:               "Diamond Vault",
      rarity:             "legendary" as const,
      color:              "#4fd1ff",
      stakingAddress:     import.meta.env.VITE_DIAMOND_STAKING_ADDRESS,
      rewardTokenAddress: import.meta.env.VITE_DIAMOND_REWARD_TOKEN_ADDRESS,
      oreMarketAddress:   import.meta.env.VITE_DIAMOND_MARKET_ADDRESS,
    },
  ] as PoolConfig[]
).filter(p => !!p.stakingAddress);
