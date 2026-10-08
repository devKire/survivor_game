"use client";

import { useActionState, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  RPG_ATTRIBUTE_KEYS,
  RPG_ATTRIBUTE_MAX,
  type RpgAttribute,
} from "../../../game/core/rpg";
import {
  allocateRpgAttributesAction,
  selectRpgCharacterAction,
  type RpgActionState,
} from "../../../server/rpg/actions";

export const attributeLabels: Record<RpgAttribute, string> = {
  vitality: "Vitalidade",
  power: "Poder",
  agility: "Agilidade",
  focus: "Foco",
  will: "Vontade",
};
const initialState: RpgActionState = { status: "idle", message: "" };

export default function CharacterForm({
  characterId,
  revision,
  requestId: initialRequest,
  selected = false,
  points,
}: {
  characterId: string;
  revision: number;
  requestId: string;
  selected?: boolean;
  points?: number;
}) {
  const allocation = points !== undefined;
  const [state, action, pending] = useActionState(
    allocation ? allocateRpgAttributesAction : selectRpgCharacterAction,
    initialState,
  );
  const [requestId, setRequestId] = useState(initialRequest);
  // Preserve the exact intent on errors so retrying keeps the same receipt hash.
  const [attribute, setAttribute] = useState("vitality");
  const [amount, setAmount] = useState("1");
  const attributeId = useId();
  const router = useRouter();
  return (
    <form
      action={action}
      aria-label={allocation ? "Distribuir atributos" : "Selecionar personagem"}
      onChange={() => setRequestId(crypto.randomUUID())}
      // React resets forms when an action returns, including expected errors.
      // Successful mutations remount this form with the new revision instead.
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="characterId" value={characterId} />
      {allocation && (
        <fieldset disabled={pending || points === 0}>
          <legend>Distribuir pontos</legend>
          <label htmlFor={attributeId}>Atributo</label>
          <select
            id={attributeId}
            name="attribute"
            value={attribute}
            onChange={(event) => setAttribute(event.target.value)}
          >
            {RPG_ATTRIBUTE_KEYS.map((key) => (
              <option key={key} value={key}>
                {attributeLabels[key]}
              </option>
            ))}
          </select>
          <label>
            Pontos{" "}
            <input
              name="amount"
              type="number"
              min={1}
              max={Math.min(points, RPG_ATTRIBUTE_MAX)}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
        </fieldset>
      )}
      <button
        type="submit"
        disabled={pending || (allocation ? points === 0 : selected)}
      >
        {pending
          ? "Salvando…"
          : allocation
            ? "Distribuir"
            : selected
              ? "Ativo"
              : "Selecionar"}
      </button>
      <p role={state.status === "error" ? "alert" : "status"}>
        {state.message}
      </p>
      {state.status === "error" && (
        <button type="button" onClick={() => router.refresh()}>
          Atualizar perfil
        </button>
      )}
    </form>
  );
}
