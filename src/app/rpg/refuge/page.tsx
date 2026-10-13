import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import {
  isRpgRefugeEnabled,
  isRpgQuestsEnabled,
  isRpgExplorationEnabled,
  isRpgExpeditionsEnabled,
} from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { rpgProfileData } from "../../../server/rpg/profile";
import { rpgPresentation } from "../../../server/rpg/presentation";
import { storagePresentation } from "../../../server/rpg/storage-presentation";
import { RPG_CHARACTERS } from "../../../game/content/rpg";
import CharacterPanel from "../character/CharacterPanel";
import EquipmentInventory from "../inventory/EquipmentInventory";
import StoragePanel from "../storage/StoragePanel";
import RefugeClient from "./RefugeClient";
import { rpgQuestJournal } from "../../../server/rpg/quests/journal";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgRefugeEnabled()) notFound();
  const user = await requirePageUser("/rpg/refuge");
  const journal = isRpgQuestsEnabled() ? await rpgQuestJournal(user.id) : undefined;
  const profile = await rpgProfileData(user.id);
  const active = profile.characters.find(
    (c) => c.id === profile.activeCharacterId,
  )!;
  const presentation = rpgPresentation(profile);
  return (
    <RefugeClient
      journal={journal}
      characterId={active.characterId}
      name={
        RPG_CHARACTERS[active.characterId as keyof typeof RPG_CHARACTERS].name
      }
      level={active.level}
      xp={active.xp}
      panels={{
        EXPLORATION: (
          <section>
            <h2>Portal de exploração</h2>
            <p>
              Descubra locais e colete recursos pessoais fora do Refúgio, em uma
              região sem ondas de combate.
            </p>
            {isRpgExplorationEnabled() ? (
              <Link href="/rpg/exploration">Escolher região de exploração</Link>
            ) : (
              <p>Exploração indisponível no momento.</p>
            )}
          </section>
        ),
        CHARACTER: <CharacterPanel profile={profile} />,
        EQUIPMENT: (
          <section>
            <h2>Arsenal</h2>
            <EquipmentInventory
              key={profile.revision}
              {...presentation}
              activeCharacter={active.characterId}
              revision={profile.revision}
              requestId={randomUUID()}
            />
            <Link href="/rpg/inventory">Abrir inventário completo</Link>
          </section>
        ),
        STORAGE: <StoragePanel {...storagePresentation(profile)} />,
        EXPEDITIONS: (
          <section>
            <h2>Quadro de expedições</h2>
            <p>
              Ruínas · 10 minutos · 1 a 5 jogadores. Prepare seu personagem e
              equipamentos no Arsenal.
            </p>
            <p>
              A build é fixada pelo servidor no START. Recompensas de XP,
              materiais e equipamentos dependem do resultado e da participação
              confirmados.
            </p>
            {isRpgExpeditionsEnabled() ? (
              <Link href="/rpg/expeditions">Preparar expedição RPG</Link>
            ) : (
              <p role="status">Expedições RPG indisponíveis no momento.</p>
            )}
          </section>
        ),
        REWARDS: (
          <section>
            <h2>Recompensas</h2>
            <p>
              Consulte o resultado persistido de cada expedição. Resultados
              pendentes ainda não concederam recompensas.
            </p>
            <Link href="/rpg/rewards">Histórico de recompensas</Link>
          </section>
        ),
      }}
    />
  );
}
