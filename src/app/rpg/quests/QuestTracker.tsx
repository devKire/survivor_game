"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { refreshQuestJournal } from "../../../server/rpg/quests/actions";
import type { QuestJournalData } from "../../../server/rpg/quests/types";
/** Changes only on durable exploration evidence, never on snapshots or ticks. */
export default function QuestTracker({
  evidenceKey = "",
  initial,
  onRevision,
}: {
  evidenceKey?: string;
  initial?: QuestJournalData;
  onRevision?: (revision: number) => void;
}) {
  const [journal, setJournal] = useState(initial),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void refreshQuestJournal({})
        .then((r) => {
          if (!current) return;
          if (r.ok) {
            setJournal(r.journal);
            onRevision?.(r.journal.revision);
            setError("");
          } else setError(r.error);
        })
        .catch(() => {
          if (current) setError("Diário indisponível. Atualize ao retornar.");
        });
    }, 750);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [evidenceKey, onRevision]);
  const active =
    journal?.quests
      .filter((q) => q.status === "ACTIVE" || q.status === "COMPLETED")
      .slice(0, 3) ?? [];
  return (
    <aside
      aria-label="Objetivos de missão"
      style={{
        background: "rgba(15,20,24,.92)",
        padding: 8,
        borderRadius: 8,
        maxWidth: 310,
      }}
    >
      <Link href="/rpg/quests">Diário de missões</Link>
      <div aria-live="polite">
        {active.map((q) => (
          <p key={q.id}>
            {q.title}:{" "}
            {q.status === "COMPLETED"
              ? "retorne para resgatar"
              : q.objectives
                  .filter((o) => o.current < o.target)
                  .map((o) => `${o.current}/${o.target}`)
                  .join(" · ")}
          </p>
        ))}
        {error && <small>{error}</small>}
      </div>
    </aside>
  );
}
