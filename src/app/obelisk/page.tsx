import { requireUser } from "../../server/auth";
import { progress } from "../../server/progress";
import { migrateSave } from "../../game/core/save";
import ObeliskClient from "./ObeliskClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser();
  return <ObeliskClient save={migrateSave((await progress(user.id)).data)} />;
}
