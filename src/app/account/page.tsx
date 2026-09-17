import { redirect } from "next/navigation";
import { session } from "../../server/auth";
import AccountClient from "./AccountClient";
import { configurationError } from "../../server/config";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page() {
  if (configurationError()) redirect("/login");
  const s = await session();
  if (!s) redirect("/login");
  return (
    <AccountClient
      user={{
        id: s.user.id,
        name: s.user.displayUsername || s.user.username || s.user.name,
      }}
    />
  );
}
