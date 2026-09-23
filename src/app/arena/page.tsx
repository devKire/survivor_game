import { requireUser } from "../../server/auth";
import ArenaClient from "./ArenaClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser();
  return <ArenaClient userId={user.id} />;
}
