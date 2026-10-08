import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RPG_CHARACTERS } from "../../../game/content/rpg";
import { isRpgEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { selectRpgCharacterAction } from "../../../server/rpg/actions";
import { rpgProfileData } from "../../../server/rpg";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!isRpgEnabled()) notFound();
  const user = await requirePageUser("/rpg/character");
  const profile = await rpgProfileData(user.id);
  const active = profile.characters.find((character) => character.id === profile.activeCharacterId);

  return <main className="account-shell rpg-page">
    <p className="eyebrow">RPG · FASE 1</p>
    <h1>Personagens</h1>
    <p className="lede">Progressão persistente separada para cada sobrevivente desbloqueado.</p>
    <nav className="actions"><Link href="/rpg/inventory">Ver inventário RPG</Link></nav>
    <div className="cards">
      {profile.characters.map((character) => {
        const definition = RPG_CHARACTERS[character.characterId as keyof typeof RPG_CHARACTERS];
        const selected = active?.id === character.id;
        return <article className="card" key={character.id}>
          <p className="eyebrow">{definition.archetype}</p>
          <h2>{definition.name}</h2>
          <p>Nível {character.level} · {character.xp} XP</p>
          <form action={selectRpgCharacterAction}>
            <input type="hidden" name="requestId" value={randomUUID()} />
            <input type="hidden" name="expectedRevision" value={profile.revision} />
            <input type="hidden" name="characterId" value={character.characterId} />
            <button type="submit" disabled={selected}>{selected ? "Ativo" : "Selecionar"}</button>
          </form>
        </article>;
      })}
    </div>
  </main>;
}
