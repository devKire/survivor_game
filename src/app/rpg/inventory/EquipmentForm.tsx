"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  mutateRpgEquipmentAction,
  type RpgActionState,
} from "../../../server/rpg/actions";
import type { RpgItemSlot } from "../../../game/core/rpg";

export default function EquipmentForm({
  characterId,
  revision,
  requestId,
  instanceId,
  slot,
  operation,
  expectedEquippedItemId,
  disabled = false,
}: {
  characterId: string;
  revision: number;
  requestId: string;
  instanceId: string;
  slot: RpgItemSlot;
  operation: "EQUIP_ITEM" | "UNEQUIP_ITEM" | "REPLACE_EQUIPMENT";
  expectedEquippedItemId?: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(mutateRpgEquipmentAction, {
    status: "idle",
    message: "",
  } as RpgActionState);
  const router = useRouter();
  const label =
    operation === "UNEQUIP_ITEM"
      ? "Desequipar"
      : operation === "REPLACE_EQUIPMENT"
        ? "Trocar equipamento"
        : "Equipar";
  return (
    <form
      action={action}
      aria-label={label}
      onReset={(e) => e.preventDefault()}
    >
      {Object.entries({
        characterId,
        expectedRevision: revision,
        requestId,
        instanceId,
        slot,
        operation,
        ...(expectedEquippedItemId ? { expectedEquippedItemId } : {}),
      }).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button disabled={disabled || pending} type="submit">
        {pending ? "Salvando…" : label}
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
