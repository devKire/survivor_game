"use client";
import { useWorldTransport } from "../world/WorldActionContext";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { RPG_ITEMS, RPG_MATERIALS } from "../../../game/content/rpg";
import { RPG_STASH_CAPACITY } from "../../../game/core/rpg/storage";
import {
  transferRpgItemAction,
  type RpgActionState,
} from "../../../server/rpg/actions";
export interface StorageItem {
  id: string;
  itemId: string;
  rarity: string;
  level: number;
  quantity: number;
  location: string;
  equipped: boolean;
  requestId: string;
}
function Transfer({ item, revision }: { item: StorageItem; revision: number }) {
  const router = useRouter();
  const world = useWorldTransport();
  const [state, action, pending] = useActionState<RpgActionState, FormData>(
    async (
      previous: RpgActionState,
      form: FormData,
    ): Promise<RpgActionState> => {
      try {
        return world
          ? await world.form("STORAGE", form)
          : await transferRpgItemAction(previous, form);
      } catch {
        return {
          status: "error",
          message: "Sem conexão. Tente novamente com o mesmo pedido.",
        };
      }
    },
    { status: "idle", message: "" },
  );
  return (
    <form action={action} aria-label={`Transferir ${item.id}`}>
      <input type="hidden" name="instanceId" value={item.id} />
      <input type="hidden" name="expectedRevision" value={revision} />
      <input type="hidden" name="requestId" value={item.requestId} />
      <input
        type="hidden"
        name="operation"
        value={item.location === "STASH" ? "WITHDRAW_ITEM" : "DEPOSIT_ITEM"}
      />
      <button disabled={pending || item.equipped}>
        {pending
          ? "Confirmando…"
          : item.location === "STASH"
            ? "Retirar"
            : "Guardar"}
      </button>
      {item.equipped && <span> Desequipe no Arsenal antes de guardar.</span>}
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
export default function StoragePanel({
  items,
  materials,
  revision,
}: {
  items: StorageItem[];
  materials: { materialId: string; amount: number }[];
  revision: number;
}) {
  return (
    <section aria-label="Depósito persistente">
      <h2>Depósito</h2>
      <p>
        {items.filter((i) => i.location === "STASH").length}/
        {RPG_STASH_CAPACITY} instâncias guardadas. Pilhas são transferidas
        inteiras. Retire antes de equipar.
      </p>
      <div className="cards">
        {(["INVENTORY", "STASH"] as const).map((location) => (
          <section
            key={location}
            aria-label={
              location === "STASH" ? "Itens guardados" : "Itens carregados"
            }
          >
            <h3>
              {location === "STASH" ? "Itens guardados" : "Inventário da conta"}
            </h3>
            {!items.some((i) => i.location === location) && (
              <p>Nenhum item nesta localização.</p>
            )}
            {items
              .filter((i) => i.location === location)
              .map((item) => (
                <article className="card" key={item.id} data-item-id={item.id}>
                  <h4>
                    {RPG_ITEMS[item.itemId as keyof typeof RPG_ITEMS]?.name ??
                      item.itemId}
                  </h4>
                  <p>
                    {item.rarity} · nível {item.level} · quantidade{" "}
                    {item.quantity}
                  </p>
                  <Transfer
                    key={`${revision}:${item.id}`}
                    item={item}
                    revision={revision}
                  />
                </article>
              ))}
          </section>
        ))}
      </div>
      <h3>Materiais da conta</h3>
      <p>Saldo compartilhado; não há transferência de materiais.</p>
      {materials.length ? (
        <ul>
          {materials.map((m) => (
            <li key={m.materialId}>
              {RPG_MATERIALS[m.materialId as keyof typeof RPG_MATERIALS]
                ?.name ?? m.materialId}
              : {m.amount}
            </li>
          ))}
        </ul>
      ) : (
        <p>Nenhum material RPG.</p>
      )}
    </section>
  );
}
