import { redirect } from "next/navigation";
import { session } from "../../server/auth";
import AccountClient from "./AccountClient";
export const dynamic = "force-dynamic";
export default async function Page() {
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
