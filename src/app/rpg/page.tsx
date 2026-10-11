import Link from "next/link";
import { notFound } from "next/navigation";
import { isRpgEnabled, isRpgExpeditionsEnabled } from "../../server/env";
import { requirePageUser } from "../../server/hub";
import { rpgProfileData } from "../../server/rpg/profile";
import { RPG_CHARACTERS, RPG_ITEMS } from "../../game/content/rpg";
import { RPG_ITEM_SLOTS } from "../../game/core/rpg";
import { slotLabels } from "./presentation";

export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgEnabled()) notFound();
  const user = await requirePageUser("/rpg");
  const profile = await rpgProfileData(user.id);
  const active = profile.characters.find(
    (c) => c.id === profile.activeCharacterId,
  )!;
  const name =
    RPG_CHARACTERS[active.characterId as keyof typeof RPG_CHARACTERS].name;
  return (
    <main className="account-shell rpg-page">
      <p className="eyebrow">ECOS DO OBELISCO</p>
      <h1>Sua jornada RPG</h1>
      <section className="card">
        <h2>{name} · personagem ativo</h2>
        <p>
          Nível RPG {active.level} · {active.xp} XP · {active.attributePoints}{" "}
          pontos disponíveis
        </p>
        <h3>Equipamentos preparados</h3>
        <ul>
          {RPG_ITEM_SLOTS.map((slot) => {
            const item = profile.items.find(
              (i) =>
                i.equippedCharacterId === active.id && i.equippedSlot === slot,
            );
            return (
              <li key={slot}>
                {slotLabels[slot]}:{" "}
                {item
                  ? (RPG_ITEMS[item.itemId as keyof typeof RPG_ITEMS]?.name ??
                    item.itemId)
                  : "Slot vazio"}
              </li>
            );
          })}
        </ul>
        <p>
          A build será fixada ao iniciar. No lobby, cada jogador confirma seu
          personagem antes de ficar pronto.
        </p>
        <nav className="actions">
          <Link href="/rpg/character">Preparar personagem</Link>
          <Link href="/rpg/inventory">Gerenciar equipamentos</Link>
        </nav>
      </section>
      <nav className="actions">
        {isRpgExpeditionsEnabled() ? (
          <Link href="/rpg/expeditions">Iniciar uma expedição RPG</Link>
        ) : (
          <p role="status">Expedições RPG indisponíveis no momento.</p>
        )}
        <Link href="/rpg/rewards">Histórico de recompensas</Link>
      </nav>
    </main>
  );
}
