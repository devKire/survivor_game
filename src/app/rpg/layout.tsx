import GameAppShell from "../hub/GameAppShell";
import { notFound } from "next/navigation";
import { isRpgEnabled } from "../../server/env";

export default function Layout({ children }: { children: React.ReactNode }) {
  if (!isRpgEnabled()) notFound();
  return <GameAppShell>{children}</GameAppShell>;
}
