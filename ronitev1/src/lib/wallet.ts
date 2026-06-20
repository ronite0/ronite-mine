import { BrowserProvider, Eip1193Provider } from "ethers";
import { RONIN_MAINNET } from "./chain";

declare global {
  interface Window {
    ronin?: { provider: Eip1193Provider };
    ethereum?: Eip1193Provider;
  }
}

/** Picks the Ronin Wallet injected provider if present, otherwise falls back
 * to any generic EIP-1193 provider (e.g. MetaMask configured for Ronin). */
export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ronin?.provider ?? window.ethereum ?? null;
}

export function isWalletAvailable(): boolean {
  return getInjectedProvider() !== null;
}

/** Asks the wallet to switch to Ronin mainnet, adding it first if the wallet
 * doesn't know about it yet. */
async function ensureRoninNetwork(injected: Eip1193Provider) {
  try {
    await injected.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: RONIN_MAINNET.chainIdHex }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await injected.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: RONIN_MAINNET.chainIdHex,
            chainName: RONIN_MAINNET.chainName,
            nativeCurrency: RONIN_MAINNET.nativeCurrency,
            rpcUrls: RONIN_MAINNET.rpcUrls,
            blockExplorerUrls: RONIN_MAINNET.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

/** Connects to the user's wallet, makes sure it's on Ronin mainnet, and
 * returns an ethers BrowserProvider + the connected address. */
export async function connectWallet(): Promise<{ provider: BrowserProvider; address: string }> {
  const injected = getInjectedProvider();
  if (!injected) {
    throw new Error("No wallet found. Install Ronin Wallet to continue.");
  }

  await injected.request({ method: "eth_requestAccounts" });
  await ensureRoninNetwork(injected);

  const provider = new BrowserProvider(injected);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, address };
}
