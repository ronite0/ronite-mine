/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
  readonly VITE_RONITE_TOKEN_ADDRESS: string;
  // Staking contracts
  readonly VITE_COAL_STAKING_ADDRESS: string;
  readonly VITE_COAL_REWARD_TOKEN_ADDRESS: string;
  readonly VITE_IRON_STAKING_ADDRESS: string;
  readonly VITE_IRON_REWARD_TOKEN_ADDRESS: string;
  readonly VITE_GOLD_STAKING_ADDRESS: string;
  readonly VITE_GOLD_REWARD_TOKEN_ADDRESS: string;
  readonly VITE_DIAMOND_STAKING_ADDRESS: string;
  readonly VITE_DIAMOND_REWARD_TOKEN_ADDRESS: string;
  // Ore market contracts
  readonly VITE_COAL_MARKET_ADDRESS: string;
  readonly VITE_IRON_MARKET_ADDRESS: string;
  readonly VITE_GOLD_MARKET_ADDRESS: string;
  readonly VITE_DIAMOND_MARKET_ADDRESS: string;
  // Airdrop Season 1
  readonly VITE_AIRDROP_CONTRACT_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
