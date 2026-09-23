import { requireUser } from "../../server/auth";
import { collection } from "../../server/collection";
import { migrateSave } from "../../game/core/save";
import CollectionClient from "../collection/CollectionClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(),
    data = await collection(user.id);
  return (
    <CollectionClient
      shop
      save={migrateSave(data.progress.data)}
      owned={data.owned}
    />
  );
}
