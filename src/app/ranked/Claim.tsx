"use client";
import { useState } from "react";
import { competitiveAction } from "../../server/actions";
export default function Claim({
  seasonId,
  mode,
}: {
  seasonId: string;
  mode: "DUEL_RANKED" | "WAR_RANKED";
}) {
  const [message, setMessage] = useState("Resgatar recompensa"),
    [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await competitiveAction({
            type: "season-claim",
            seasonId,
            mode,
          });
          setMessage(r.ok ? "Recompensa entregue" : r.error);
        } finally {
          setBusy(false);
        }
      }}
    >
      {message}
    </button>
  );
}
