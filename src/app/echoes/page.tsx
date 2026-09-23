import { requireUser } from "../../server/auth";
import { echoProfile } from "../../server/echoes";
import { collection } from "../../server/collection";
import { migrateSave } from "../../game/core/save";
import { echoResults } from "../../game/content/gacha";
import EchoClient from "./EchoClient";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await requireUser(),
    [profile, data] = await Promise.all([
      echoProfile(user.id),
      collection(user.id),
    ]);
  return (
    <EchoClient
      save={migrateSave(data.progress.data)}
      owned={data.owned}
      state={profile.state}
      history={profile.history.map((h) => ({
        id: h.id,
        at: h.createdAt.toISOString(),
        currency: h.currency,
        cost: h.cost,
        results: echoResults.parse(h.results),
      }))}
    />
  );
}
