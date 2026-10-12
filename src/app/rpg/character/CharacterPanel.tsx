import { randomUUID } from "node:crypto";
import Link from "next/link";
import { RPG_CHARACTERS, RPG_ITEMS } from "../../../game/content/rpg";
import { rpgProfileData } from "../../../server/rpg";
import { RPG_ATTRIBUTE_KEYS, RPG_ITEM_SLOTS } from "../../../game/core/rpg";
import { rpgPresentation } from "../../../server/rpg/presentation";
import { StatsPreview } from "../StatsPreview";
import { slotLabels } from "../presentation";
import CharacterForm from "./CharacterForms";

export default function CharacterPanel({ profile }: { profile: Awaited<ReturnType<typeof rpgProfileData>> }) {
  const presentation = rpgPresentation(profile);
  const active = profile.characters.find(
    (character) => character.id === profile.activeCharacterId,
  );

  return (
    <section className="rpg-page">
      <p className="eyebrow">RPG</p>
      <h2>Personagens</h2>
      <p className="lede">
        Progressão persistente separada para cada sobrevivente desbloqueado.
      </p>
      <nav className="actions">
        <Link href="/rpg/inventory">Ver inventário RPG</Link>
      </nav>
      <div className="cards">
        {profile.characters.map((character) => {
          const definition =
            RPG_CHARACTERS[
              character.characterId as keyof typeof RPG_CHARACTERS
            ];
          const selected = active?.id === character.id;
          const build = presentation.characters.find(
            (c) => c.characterId === character.characterId,
          )!;
          return (
            <article className="card" key={character.id}>
              <p className="eyebrow">{definition.archetype}</p>
              <h2>{definition.name}</h2>
              <p>
                Nível {character.level} · {character.xp} XP
              </p>
              <CharacterForm
                key={`select:${profile.revision}`}
                characterId={character.characterId}
                revision={profile.revision}
                requestId={randomUUID()}
                selected={selected}
              />
              <p>Pontos disponíveis: {character.attributePoints}</p>
              <dl>
                {RPG_ATTRIBUTE_KEYS.map((attribute) => (
                  <div key={attribute}>
                    <dt>
                      {
                        {
                          vitality: "Vitalidade",
                          power: "Poder",
                          agility: "Agilidade",
                          focus: "Foco",
                          will: "Vontade",
                        }[attribute]
                      }
                    </dt>
                    <dd>{character.attributes[attribute]}</dd>
                  </div>
                ))}
              </dl>
              <CharacterForm
                key={`attributes:${profile.revision}`}
                characterId={character.characterId}
                revision={profile.revision}
                requestId={randomUUID()}
                points={character.attributePoints}
              />
              <h3>Prévia de combate RPG</h3>
              <StatsPreview base={build.base} preview={build.preview} />
              <h3>Equipamentos</h3>
              <ul>
                {RPG_ITEM_SLOTS.map((slot) => {
                  const item = presentation.items.find(
                    (i) =>
                      i.equippedCharacter === character.characterId &&
                      i.equippedSlot === slot,
                  );
                  return (
                    <li key={slot}>
                      {slotLabels[slot]}:{" "}
                      {item
                        ? (RPG_ITEMS[item.itemId as keyof typeof RPG_ITEMS]
                            ?.name ?? item.itemId)
                        : "Slot vazio"}
                    </li>
                  );
                })}
              </ul>
              <Link href="/rpg/inventory">Gerenciar equipamentos</Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
