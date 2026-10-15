import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import {
  isRpgSharedWorldEnabled,
  isRpgQuestsEnabled,
} from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { rpgProfileData } from "../../../server/rpg/profile";
import { rpgPresentation } from "../../../server/rpg/presentation";
import { storagePresentation } from "../../../server/rpg/storage-presentation";
import { rpgQuestJournal } from "../../../server/rpg/quests/journal";
import CharacterPanel from "../character/CharacterPanel";
import EquipmentInventory from "../inventory/EquipmentInventory";
import StoragePanel from "../storage/StoragePanel";
import WorldClient from "./WorldClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgSharedWorldEnabled()) notFound();
  const user = await requirePageUser("/rpg/world");
  const journal = isRpgQuestsEnabled()
    ? await rpgQuestJournal(user.id)
    : undefined;
  const profile = await rpgProfileData(user.id),
    active = profile.characters.find(
      (c) => c.id === profile.activeCharacterId,
    )!;
  const equipment = (
    <EquipmentInventory
      key={profile.revision}
      {...rpgPresentation(profile)}
      activeCharacter={active.characterId}
      revision={profile.revision}
      requestId={randomUUID()}
    />
  );
  return (
    <WorldClient
      initialJournal={journal}
      panels={{
        CHARACTER: <CharacterPanel profile={profile} embedded />,
        INVENTORY: equipment,
        EQUIPMENT: equipment,
        STORAGE: <StoragePanel {...storagePresentation(profile)} />,
      }}
    />
  );
}
