import { requireUser } from "../../server/auth";
import { progress } from "../../server/progress";
import { migrateSave } from "../../game/core/save";
import CloudSolo from "./CloudSolo";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(),
    row = await progress(user.id);
  return (
    <CloudSolo
      userId={user.id}
      initial={migrateSave(row.localArchive || row.data)}
      revision={row.version}
    />
  );
}
