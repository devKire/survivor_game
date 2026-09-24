import { requirePageUser } from "../../server/hub";
import { collection } from "../../server/collection";
import { migrateSave } from "../../game/core/save";
import CollectionClient from "../collection/CollectionClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requirePageUser("/shop"),
    data = await collection(user.id);
  return (
    <CollectionClient
      shop
      save={migrateSave(data.progress.data)}
      owned={data.owned}
    />
  );
}
