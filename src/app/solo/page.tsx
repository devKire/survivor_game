import { requireUser } from "../../server/auth";
import { progress } from "../../server/progress";
import { migrateSave } from "../../game/core/save";
import CloudSolo from "./CloudSolo";
import { redirect } from "next/navigation";
import { configurationError } from "../../server/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page() {
  if (configurationError()) redirect("/login");
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
