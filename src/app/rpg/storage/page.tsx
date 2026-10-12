import { notFound } from "next/navigation";
import { isRpgRefugeEnabled } from "../../../server/env";
import { requirePageUser } from "../../../server/hub";
import { rpgProfileData } from "../../../server/rpg/profile";
import { storagePresentation } from "../../../server/rpg/storage-presentation";
import StoragePanel from "./StoragePanel";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!isRpgRefugeEnabled()) notFound();
  const user = await requirePageUser("/rpg/storage");
  return (
    <main className="account-shell">
      <StoragePanel {...storagePresentation(await rpgProfileData(user.id))} />
    </main>
  );
}
