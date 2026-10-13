"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { prepareExploration } from "../../../server/rpg/exploration/actions";
export default function PrepareExploration() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    router = useRouter();
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await prepareExploration({
              regionId: "ruins-outskirts",
            });
            if (result.ok) router.push("/team");
            else setError(result.error);
          } catch {
            setError("Sem conexão. Tente novamente.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparando…" : "Preparar Arredores das Ruínas"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
