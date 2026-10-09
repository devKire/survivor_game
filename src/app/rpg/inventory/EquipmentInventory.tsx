"use client";
import { useState } from "react";
import { RPG_CHARACTERS, RPG_ITEMS } from "../../../game/content/rpg";
import { RPG_AFFIXES } from "../../../game/content/rpg/affixes";
import {
  assertCanEquip,
  COMBAT_STAT_KEYS,
  createRpgCombatLoadout,
  equipmentDefinition,
  equipmentRequirement,
  previewRpgBuild,
  RPG_ITEM_SLOTS,
  type RpgCombatLoadout,
  type RpgRarity,
} from "../../../game/core/rpg";
import type { RpgPresentation } from "../../../server/rpg/presentation";
import {
  modifierText,
  rarityLabels,
  slotLabels,
  statLabels,
  statValue,
} from "../presentation";
import { StatsPreview } from "../StatsPreview";
import EquipmentForm from "./EquipmentForm";
import styles from "../rpg.module.css";

export default function EquipmentInventory({
  items,
  characters,
  activeCharacter,
  revision,
  requestId: initialRequest,
}: RpgPresentation & {
  activeCharacter: string;
  revision: number;
  requestId: string;
}) {
  const [characterId, setCharacterId] = useState(activeCharacter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(initialRequest);
  const character = characters.find((c) => c.characterId === characterId)!;
  const selected = items.find((i) => i.id === selectedId);
  const item = selected?.equipment;
  const definition = item
    ? equipmentDefinition(item.itemId, item.contentVersion)
    : null;
  const current = definition
    ? items.find(
        (i) =>
          i.equippedCharacter === characterId &&
          i.equippedSlot === definition.slot,
      )
    : null;
  const sameItem = current?.id === selected?.id;
  let unavailable = "";
  let after: RpgCombatLoadout | null = null;
  if (item && definition && !sameItem) {
    try {
      assertCanEquip(item, character, definition.slot);
      if (!character.loadout)
        throw new Error(
          "Remova equipamentos incompatíveis para comparar esta build.",
        );
      after = createRpgCombatLoadout({
        characterId,
        level: character.level,
        attributes: character.loadout.attributes,
        equipment: [
          ...character.loadout.equipment
            .filter((i) => i.slot !== definition.slot)
            .map((i) => items.find((owned) => owned.id === i.id)!.equipment!),
          item,
        ],
        profileRevision: revision,
      });
    } catch (error) {
      unavailable =
        error instanceof Error ? error.message : "Equipamento indisponível.";
    }
  }
  const name = (id: string) =>
    RPG_ITEMS[id as keyof typeof RPG_ITEMS]?.name ?? id;
  const characterName = (id: string) =>
    RPG_CHARACTERS[id as keyof typeof RPG_CHARACTERS]?.name ?? id;
  const beforeStats = character.loadout
    ? previewRpgBuild(character.base, character.loadout).effective
    : null;
  const afterStats = after
    ? previewRpgBuild(character.base, after).effective
    : null;
  return (
    <>
      <p>
        Personagem ativo: <strong>{characterName(activeCharacter)}</strong>
      </p>
      <label>
        Gerenciar equipamentos de{" "}
        <select
          value={characterId}
          onChange={(e) => {
            setCharacterId(e.target.value);
            setRequestId(crypto.randomUUID());
          }}
        >
          {characters.map((c) => (
            <option key={c.characterId} value={c.characterId}>
              {characterName(c.characterId)} · nível RPG {c.level}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.note}>
        Prévia para a futura Expedição RPG. Survivor e PvP não recebem estes
        bônus. Mudanças valem na próxima sessão RPG.
      </p>
      <div className={styles.layout}>
        <section className={styles.panel} aria-label="Equipamentos por slot">
          <h2>Equipamentos de {characterName(characterId)}</h2>
          <ul className={styles.slots}>
            {RPG_ITEM_SLOTS.map((slot) => {
              const equipped = items.find(
                (i) =>
                  i.equippedCharacter === characterId &&
                  i.equippedSlot === slot,
              );
              return (
                <li
                  className={styles.slot}
                  key={slot}
                  aria-label={slotLabels[slot]}
                >
                  <strong>
                    {slotLabels[slot]} · {slot}
                  </strong>
                  <p>{equipped ? name(equipped.itemId) : "Slot vazio"}</p>
                  {equipped && (
                    <EquipmentForm
                      key={`${revision}:${characterId}:${equipped.id}`}
                      characterId={characterId}
                      revision={revision}
                      requestId={equipped.requestId}
                      instanceId={equipped.id}
                      slot={slot}
                      operation="UNEQUIP_ITEM"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className={styles.panel} aria-label="Detalhes do equipamento">
          <h2>Detalhes</h2>
          {!selected ? (
            <p>Selecione um item para ver requisitos e comparar a build.</p>
          ) : (
            <>
              <h3>{name(selected.itemId)}</h3>
              <p>
                {rarityLabels[selected.rarity as RpgRarity] ?? selected.rarity}{" "}
                · nível {selected.level} · quantidade {selected.quantity}
              </p>
              {!item || !definition ? (
                <p role="status">
                  Item indisponível para equipar. Se equipado, você ainda pode
                  removê-lo pelo slot.
                </p>
              ) : (
                <>
                  <p>{definition.description}</p>
                  <p>
                    Requisito: nível RPG {equipmentRequirement(item)} ·{" "}
                    {definition.allowedCharacters
                      ?.map(characterName)
                      .join(", ") ?? "Todos os personagens"}
                  </p>
                  <h4>Atributos base</h4>
                  <ul>
                    {definition.baseModifiers.map((m, index) => (
                      <li key={index}>{modifierText(m)}</li>
                    ))}
                  </ul>
                  <h4>Affixes</h4>
                  {item.affixes.length === 0 ? (
                    <p>Sem affixes.</p>
                  ) : (
                    <ul>
                      {item.affixes.map((a) => {
                        const affix =
                          RPG_AFFIXES[a.id as keyof typeof RPG_AFFIXES];
                        return (
                          <li key={a.id}>
                            {affix.name} · tier {a.tier} ·{" "}
                            {modifierText({ ...affix, value: a.value })}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p>
                    Equipamento atual:{" "}
                    {current ? name(current.itemId) : "Slot vazio"}
                  </p>
                  {selected.equippedCharacter && (
                    <p>
                      Equipado em {characterName(selected.equippedCharacter)}.
                      {!sameItem && " Equipar aqui transfere a instância."}
                    </p>
                  )}
                  {unavailable && <p role="status">{unavailable}</p>}
                  {beforeStats && afterStats && (
                    <div className={styles.tableScroll}>
                      <table className={styles.stats}>
                        <caption>
                          Comparação · cooldown menor é mais rápido
                        </caption>
                        <thead>
                          <tr>
                            <th>Stat</th>
                            <th>Antes</th>
                            <th>Depois</th>
                            <th>Diferença</th>
                          </tr>
                        </thead>
                        <tbody>
                          {COMBAT_STAT_KEYS.map((key) => {
                            const delta = afterStats[key] - beforeStats[key];
                            return (
                              <tr key={key}>
                                <th scope="row">{statLabels[key]}</th>
                                <td>{statValue(key, beforeStats[key])}</td>
                                <td>{statValue(key, afterStats[key])}</td>
                                <td>
                                  {delta > 0 ? "+" : ""}
                                  {statValue(key, delta)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {sameItem ? (
                    <p>Este item já está equipado.</p>
                  ) : (
                    <EquipmentForm
                      key={`${revision}:${characterId}:${selected.id}:${requestId}`}
                      characterId={characterId}
                      revision={revision}
                      requestId={requestId}
                      instanceId={selected.id}
                      slot={definition.slot}
                      operation={current ? "REPLACE_EQUIPMENT" : "EQUIP_ITEM"}
                      expectedEquippedItemId={current?.id}
                      disabled={!!unavailable}
                    />
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
      <section className={styles.panel} aria-label="Inventário de equipamentos">
        <h2>Itens</h2>
        {items.length === 0 ? (
          <p className="muted">Nenhum item RPG.</p>
        ) : (
          <ul className={styles.items}>
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  aria-pressed={selectedId === i.id}
                  onClick={() => {
                    setSelectedId(i.id);
                    setRequestId(crypto.randomUUID());
                  }}
                >
                  {name(i.itemId)}
                  <small>
                    {rarityLabels[i.rarity as RpgRarity] ?? i.rarity} · nível{" "}
                    {i.level} · ×{i.quantity}
                  </small>
                  <small>
                    {i.equippedCharacter
                      ? `Equipado: ${characterName(i.equippedCharacter)}`
                      : "Disponível"}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <StatsPreview base={character.base} loadout={character.loadout} />
    </>
  );
}
