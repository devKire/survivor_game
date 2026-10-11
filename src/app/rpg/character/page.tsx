import { notFound } from "next/navigation";
import { isRpgEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { rpgProfileData } from "../../../server/rpg/profile";
import CharacterPanel from "./CharacterPanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgEnabled()) notFound();
  const user = await requirePageUser("/rpg/character");
  const profile = await rpgProfileData(user.id);
  return <main className="account-shell"><CharacterPanel profile={profile}/></main>;
}
