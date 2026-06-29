import { useState, useEffect } from "react";
import App from "./App";
import { AirdropPage }      from "./Airdrop";
import { AirdropClaimPage } from "./Airdropclaim";
import { AirdropAdminPage } from "./Airdropadmin";
import { VestingPage }      from "./Vesting";

type Page = "mining" | "airdrop" | "claim" | "admin" | "vesting";

function getPage(): Page {
  const hash = window.location.hash.replace("#", "").split("?")[0].trim();
  if (hash === "airdrop") return "airdrop";
  if (hash === "claim")   return "claim";
  if (hash === "admin")   return "admin";
  if (hash === "vesting") return "vesting";
  return "mining";
}

export default function Router() {
  const [page, setPage] = useState<Page>(getPage);

  useEffect(() => {
    const onHash = () => setPage(getPage());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (page === "airdrop") return <AirdropPage />;
  if (page === "claim")   return <AirdropClaimPage />;
  if (page === "admin")   return <AirdropAdminPage />;
  if (page === "vesting") return <VestingPage />;

  return (
    <>
      <App />

      {/* Vesting button */}
      <button
        onClick={() => { window.location.hash = "#vesting"; }}
        style={{
          position: "fixed", bottom: 104, right: 20, zIndex: 1000,
          background: "rgba(139,92,246,0.15)", border: "2px solid #8b5cf6",
          color: "#8b5cf6", fontFamily: "var(--font-mono)", fontSize: "7px",
          padding: "10px 16px", boxShadow: "3px 3px 0 #000", cursor: "pointer",
          letterSpacing: "0.06em", textTransform: "uppercase" as const,
        }}
      >
        🔒 Vesting
      </button>

      <button
        onClick={() => { window.location.hash = "#airdrop"; }}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 1000,
          background: "rgba(168,85,247,0.15)", border: "2px solid #a855f7",
          color: "#a855f7", fontFamily: "var(--font-mono)", fontSize: "7px",
          padding: "10px 16px", boxShadow: "3px 3px 0 #000", cursor: "pointer",
          letterSpacing: "0.06em", textTransform: "uppercase" as const,
        }}
      >
        🎁 Airdrop
      </button>

      <button
        onClick={() => { window.location.hash = "#claim"; }}
        style={{
          position: "fixed", bottom: 62, right: 20, zIndex: 1000,
          background: "rgba(245,158,11,0.15)", border: "2px solid #f59e0b",
          color: "#f59e0b", fontFamily: "var(--font-mono)", fontSize: "7px",
          padding: "10px 16px", boxShadow: "3px 3px 0 #000", cursor: "pointer",
          letterSpacing: "0.06em", textTransform: "uppercase" as const,
        }}
      >
        🪙 Claim
      </button>
    </>
  );
}
