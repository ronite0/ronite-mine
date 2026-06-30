import { useEffect, useState } from "react";
import { GECKOTERMINAL_API_URL } from "./chain";

export interface RonitePrice {
  priceUsd:        number | null;
  change24hPct:    number | null;
  volume24hUsd:    number | null;
  loading:         boolean;
  error:           boolean;
}

const POLL_MS = 30_000;

/** Live RONITE/WRON price pulled from the GeckoTerminal public pool API.
 * Polls every 30s and fails soft — UI should just hide the figure if `error`. */
export function useRonitePrice(): RonitePrice {
  const [state, setState] = useState<RonitePrice>({
    priceUsd: null, change24hPct: null, volume24hUsd: null,
    loading: true, error: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const res = await fetch(GECKOTERMINAL_API_URL, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`geckoterminal ${res.status}`);
        const json = await res.json();
        const attrs = json?.data?.attributes;
        if (!attrs) throw new Error("no attributes in response");

        const priceUsd = attrs.base_token_price_usd != null
          ? Number(attrs.base_token_price_usd)
          : null;
        const change24hPct = attrs.price_change_percentage?.h24 != null
          ? Number(attrs.price_change_percentage.h24)
          : null;
        const volume24hUsd = attrs.volume_usd?.h24 != null
          ? Number(attrs.volume_usd.h24)
          : null;

        if (!cancelled) {
          setState({ priceUsd, change24hPct, volume24hUsd, loading: false, error: priceUsd == null });
        }
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false, error: true }));
      }
    }

    fetchPrice();
    const id = setInterval(fetchPrice, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return state;
}
