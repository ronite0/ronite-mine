// abi function in smart contract

export const MINING_STAKING_ABI = [
  "function totalStaked() view returns (uint256)",
  "function rewardRate() view returns (uint256)",
  "function periodFinish() view returns (uint256)",
  "function stakedBalance(address) view returns (uint256)",
  "function earned(address) view returns (uint256)",
  "function stake(uint256 amount)",
  "function withdraw(uint256 amount)",
  "function getReward()",
  "function exit()",
];

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export const RONITE_ABI = [
  ...ERC20_ABI,
  "function RATE() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function buy() payable",
  "function ownerMint(address to, uint256 amount)",
];

export const ORE_MARKET_ABI = [
  "function sell(uint256 oreAmount) returns (uint256 ronitePaid)",
  "function orePerRonite() view returns (uint256)",
  "function quoteRonite(uint256 oreAmount) view returns (uint256)",
  "function roniteReserve() view returns (uint256)",
  "function depositRonite(uint256 amount)",
  "function setRate(uint256 newRate)",
  "function setPaused(bool paused)",
];
