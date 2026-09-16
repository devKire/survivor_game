import Link from "next/link";
export default function Home() {
  return (
    <main id="screen">
      <section className="panel">
        <span className="eyebrow">ECOS DO OBELISCO</span>
        <h1 className="logo">LIMIAR</h1>
        <div className="stack">
          <Link href="/login">ENTRAR</Link>
          <Link href="/register">CRIAR CONTA</Link>
          <Link href="/offline">JOGAR OFFLINE</Link>
        </div>
      </section>
    </main>
  );
}
