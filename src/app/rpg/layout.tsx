import Link from "next/link";
import { isRpgRefugeEnabled } from "../../server/env";
import GameAppShell from "../hub/GameAppShell";
import { notFound } from "next/navigation";
import { isRpgEnabled } from "../../server/env";

export default function Layout({ children }: { children: React.ReactNode }) {
  if (!isRpgEnabled()) notFound();
  return <GameAppShell>{isRpgRefugeEnabled() && <nav className="actions" aria-label="Refúgio"><Link href="/rpg/refuge">Voltar ao Refúgio</Link><Link href="/rpg/storage">Depósito</Link></nav>}{children}</GameAppShell>;
}
