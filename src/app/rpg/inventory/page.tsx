import Link from "next/link";
import { notFound } from "next/navigation";
import { RPG_ITEMS, RPG_MATERIALS } from "../../../game/content/rpg";
import { isRpgEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { rpgProfileData } from "../../../server/rpg";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!isRpgEnabled()) notFound();
  const user = await requirePageUser("/rpg/inventory");
  const profile = await rpgProfileData(user.id);
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
      <section>
        <h2>Itens</h2>
        {profile.items.length === 0 ? (
          <p className="muted">Nenhum item RPG.</p>
        ) : (
          <div className="cards">
            {profile.items.map((item) => (
              <article className="card" key={item.id}>
                <h3>
                  {RPG_ITEMS[item.itemId as keyof typeof RPG_ITEMS]?.name ??
                    item.itemId}
                </h3>
                <p>
                  {item.rarity} · nível {item.level} · quantidade{" "}
                  {item.quantity}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
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
