export const RONIN_MAINNET = {
  chainId: 2020,
  chainIdHex: "0x7e4",
  chainName: "Ronin",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: ["https://ronin.drpc.org"],
  blockExplorerUrls: ["https://app.roninchain.com"],
};

export const RONITE_ADDRESS = import.meta.env.VITE_RONITE_TOKEN_ADDRESS as string;
export const BACKEND_URL    = (import.meta.env.VITE_BACKEND_URL as string) || "";

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
