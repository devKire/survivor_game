import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { RPG_MATERIALS } from "../../../game/content/rpg";
import { rpgPresentation } from "../../../server/rpg/presentation";
import EquipmentInventory from "./EquipmentInventory";
import { isRpgEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { rpgProfileData } from "../../../server/rpg";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!isRpgEnabled()) notFound();
  const user = await requirePageUser("/rpg/inventory");
  const profile = await rpgProfileData(user.id);
  const presentation = rpgPresentation(profile);
  return (
    <main className="account-shell rpg-page">
      <p className="eyebrow">RPG</p>
      <h1>Inventário persistente</h1>
      <p className="lede">
        Este inventário não altera os itens temporários das expedições.
      </p>
      <nav className="actions">
        <Link href="/rpg/character">Ver personagens RPG</Link>
      </nav>
      <EquipmentInventory
        key={profile.revision}
        {...presentation}
        activeCharacter={
          profile.characters.find((c) => c.id === profile.activeCharacterId)!
            .characterId
        }
        revision={profile.revision}
        requestId={randomUUID()}
      />
      <section>
        <h2>Materiais</h2>
        {profile.materials.length === 0 ? (
          <p className="muted">Nenhum material RPG.</p>
        ) : (
          <ul>
            {profile.materials.map((material) => (
              <li key={material.materialId}>
                {RPG_MATERIALS[
                  material.materialId as keyof typeof RPG_MATERIALS
                ]?.name ?? material.materialId}
                : {material.amount}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
