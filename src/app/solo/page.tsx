import { requirePageUser } from "../../server/hub";
import { progress } from "../../server/progress";
import { migrateSave } from "../../game/core/save";
import CloudSolo from "./CloudSolo";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page() {
  const user = await requirePageUser("/solo"),
    row = await progress(user.id);
  return (
    <CloudSolo
      userId={user.id}
      initial={migrateSave(row.localArchive || row.data)}
      revision={row.version}
    />
  );
}
