"use client";
import { useWorldTransport } from "../world/WorldActionContext";
import type { QuestMutationResult } from "../../../server/rpg/quests/types";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  questCommand,
  dialogueCommand,
  refreshQuestJournal,
} from "../../../server/rpg/quests/actions";
import type {
  QuestJournalData,
  DialogueView,
} from "../../../server/rpg/quests/types";
import { RPG_CHARACTERS, RPG_MATERIALS } from "../../../game/content/rpg";
const statusLabels = {
  LOCKED: "Bloqueada",
  AVAILABLE: "Disponível",
  ACTIVE: "Em andamento",
  COMPLETED: "Pronta para resgate",
  REWARDED: "Recompensa recebida",
};
export const questNpcNames: Record<string, string> = {
  "refuge:guardian": "Guardião do Refúgio",
  "refuge:guide": "Orientador",
  "refuge:keeper": "Responsável pelo Depósito",
  "refuge:armorer": "Armeiro",
};
function materials(
  entries: readonly { materialId: string; quantity: number }[],
) {
  return (
    entries
      .map(
        (m) =>
          `${m.quantity} ${RPG_MATERIALS[m.materialId as keyof typeof RPG_MATERIALS]?.name ?? m.materialId}`,
      )
      .join(", ") || "Nenhum"
  );
}
export default function QuestJournal({
  initial,
  npcId,
  onChange,
}: {
  initial: QuestJournalData;
  npcId?: string;
  onChange?: (journal: QuestJournalData) => void;
}) {
  const world = useWorldTransport();
  const [journal, setJournal] = useState(initial),
    [dialogue, setDialogue] = useState<DialogueView>(),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [pending, start] = useTransition();
  const retry = useRef<{
    key: string;
    requestId: string;
    expectedRevision: number;
  } | null>(null);
  function command(
    kind: "ACCEPT" | "CLAIM" | "OPEN" | "CHOOSE",
    id: string,
    choiceId?: string,
  ) {
    const key = JSON.stringify([kind, id, choiceId]);
    if (retry.current?.key !== key)
      retry.current = {
        key,
        requestId: crypto.randomUUID(),
        expectedRevision: journal.revision,
      };
    const common = {
      requestId: retry.current.requestId,
      expectedRevision: retry.current.expectedRevision,
    };
    start(async () => {
      try {
        const quest = kind === "ACCEPT" || kind === "CLAIM";
        const intent = quest
          ? { ...common, kind, questId: id }
          : {
              ...common,
              kind,
              npcId: id,
              ...(kind === "CHOOSE" ? { choiceId } : {}),
            };
        const result = world
          ? {
              ok: true as const,
              ...((await world.rpc(
                quest ? "QUEST" : "DIALOGUE",
                intent,
              )) as QuestMutationResult),
            }
          : quest
            ? await questCommand(intent)
            : await dialogueCommand(intent);

        if (!result.ok) {
          setFailed(true);
          setMessage(result.error);
          return;
        }
        retry.current = null;
        setJournal(result.journal);
        onChange?.(result.journal);
        setMessage(result.message);
        setFailed(false);
        if (result.dialogue) setDialogue(result.dialogue);
      } catch (error) {
        setFailed(true);
        setMessage(
          world && error instanceof Error
            ? error.message
            : "Conexão interrompida. Repita a mesma ação para consultar sua confirmação.",
        );
      }
    });
  }
  function refresh(cursor?: string) {
    start(async () => {
      try {
        const result = world
          ? {
              ok: true as const,
              journal: (await world.rpc(
                "JOURNAL",
                cursor ? { cursor } : {},
              )) as QuestJournalData,
              message: "Diário atualizado.",
            }
          : await refreshQuestJournal(cursor ? { cursor } : {});
        if (result.ok) {
          setJournal(result.journal);
          onChange?.(result.journal);
          retry.current = null;
          setDialogue(undefined);
          setMessage(result.message);
          setFailed(false);
        } else {
          setMessage(result.error);
          setFailed(true);
        }
      } catch {
        setMessage("Conexão indisponível. Tente atualizar novamente.");
        setFailed(true);
      }
    });
  }
  return (
    <section
      aria-label={npcId ? "Serviço narrativo" : "Diário de missões"}
      aria-busy={pending}
    >
      <nav className="actions">
        <button disabled={pending} onClick={() => refresh()}>
          Atualizar diário
        </button>
        {npcId && !world && (
          <Link href="/rpg/quests">Abrir diário completo</Link>
        )}
      </nav>
      <p role={failed ? "alert" : "status"}>
        {pending ? "Confirmando…" : message}
      </p>
      <nav className="actions" aria-label="Conversas narrativas">
        {Object.entries(questNpcNames)
          .filter(([id]) => (!world || !!npcId) && (!npcId || id === npcId))
          .map(([id, name]) => (
            <button
              key={id}
              disabled={pending}
              onClick={() => command("OPEN", id)}
            >
              Conversar: {name}
            </button>
          ))}
      </nav>
      {dialogue && (
        <section
          className="card"
          aria-label={`Conversa: ${questNpcNames[dialogue.npcId]}`}
        >
          <h3>{questNpcNames[dialogue.npcId]}</h3>
          <p>{dialogue.text}</p>
          <div className="actions">
            {dialogue.choices.map((c) => (
              <button
                key={c.id}
                disabled={pending || !c.available}
                title={c.unavailableReason}
                onClick={() => command("CHOOSE", dialogue.npcId, c.id)}
              >
                {c.text}
                {!c.available ? " · indisponível" : ""}
              </button>
            ))}
          </div>
          <button onClick={() => setDialogue(undefined)}>
            Fechar conversa
          </button>
        </section>
      )}
      {journal.quests
        .filter((q) => !npcId || q.npcId === npcId)
        .map((q) => (
          <article className="card" key={q.id} data-quest={q.id}>
            <p>
              {q.category === "MAIN" ? "Missão principal" : "Missão secundária"}{" "}
              · {statusLabels[q.status]}
            </p>
            <h2>{q.title}</h2>
            <p>{q.description}</p>
            <p>
              Contato: {questNpcNames[q.npcId]}
              {q.regionId ? " · Arredores das Ruínas" : ""}
            </p>
            <ul>
              {q.objectives.map((o) => (
                <li key={o.id}>
                  {o.label}:{" "}
                  <strong>
                    {o.current} / {o.target}
                  </strong>
                </li>
              ))}
            </ul>
            {q.status === "LOCKED" && (
              <ul>
                {q.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <p>
              Recompensa prevista: {q.reward.xp} XP RPG ·{" "}
              {materials(q.reward.materials)}
            </p>
            {!!q.reward.costs.length && (
              <p>
                Entrega no resgate: {materials(q.reward.costs)}. Consumo e
                recompensa são confirmados juntos.
              </p>
            )}
            <p>
              Escopo: {q.scope === "ACCOUNT" ? "conta" : "personagem"}. XP para{" "}
              {q.characterId
                ? RPG_CHARACTERS[q.characterId as keyof typeof RPG_CHARACTERS]
                    ?.name
                : "o personagem ativo no aceite"}
              .
            </p>
            {q.status === "AVAILABLE" && (
              <button
                disabled={pending}
                onClick={() => command("ACCEPT", q.id)}
              >
                Aceitar missão
              </button>
            )}
            {q.status === "COMPLETED" && (
              <button disabled={pending} onClick={() => command("CLAIM", q.id)}>
                Resgatar recompensa
              </button>
            )}
            {q.status === "ACTIVE" && (
              <p>
                Próximo passo:{" "}
                {q.objectives.find((o) => o.current < o.target)?.label}.
              </p>
            )}
            {q.receipt && (
              <p role="status">
                Recebido: {q.receipt.xpGranted} XP · nível{" "}
                {q.receipt.previousLevel} → {q.receipt.newLevel} ·{" "}
                {q.receipt.pointsGranted} pontos ·{" "}
                {materials(q.receipt.materials)}. Entrega:{" "}
                {materials(q.receipt.costs)}.
              </p>
            )}
          </article>
        ))}
      {!npcId && (
        <>
          <h2>Suas escolhas</h2>
          {journal.choices.length ? (
            journal.choices.map((c) => (
              <p key={c.groupId}>
                Prioridade registrada:{" "}
                {c.value === "REMNANTS" ? "Vestígios" : "Ecos"}. Essa decisão
                permanece na conta e altera as conversas.
              </p>
            ))
          ) : (
            <p>Nenhuma prioridade registrada.</p>
          )}
          <h2>Histórico</h2>
          <ul>
            {journal.history.map((h) => (
              <li key={h.id}>
                {h.title} ·{" "}
                {statusLabels[h.status as keyof typeof statusLabels]} ·{" "}
                {new Date(h.at).toLocaleDateString("pt-BR")}
              </li>
            ))}
          </ul>
          {journal.nextCursor && (
            <button
              disabled={pending}
              onClick={() => refresh(journal.nextCursor!)}
            >
              Mais registros
            </button>
          )}
        </>
      )}
    </section>
  );
}
