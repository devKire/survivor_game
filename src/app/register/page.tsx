import AuthForm from "../AuthForm";
import Link from "next/link";
import { configurationError } from "../../server/config";
export const dynamic = "force-dynamic";
export default function Page() {
  const error = configurationError();
  return error ? (
    <main className="account-screen">
      <section className="panel">
        <h1>Configuração necessária</h1>
        <p role="alert">{error}</p>
        <Link href="/offline">JOGAR OFFLINE</Link>
      </section>
    </main>
  ) : (
    <AuthForm signup />
  );
}
