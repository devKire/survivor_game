import Link from "next/link";
import { requireUser } from "../../server/auth";
import { getRating, closedSeasonCutoff } from "../../server/ranked";
import { db } from "../../server/db";
import { rankOf } from "../../game/content/ranked";
import Claim from "./Claim";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser(),
    query = await searchParams,
    mode = query.mode === "WAR_RANKED" ? "WAR_RANKED" : "DUEL_RANKED",
    { season, rating } = await getRating(user.id, mode);
  const [leaders, past, recent] = await Promise.all([
    db().rankedRating.findMany({
      where: { seasonId: season.id, mode, games: { gte: 1 } },
      orderBy: [{ mmr: "desc" }, { wins: "desc" }],
      take: 100,
      include: { user: { select: { username: true, name: true } } },
    }),
    db().rankedRating.findMany({
      where: {
        userId: user.id,
        mode,
        games: { gte: 10 },
        season: { endsAt: { lt: closedSeasonCutoff() } },
      },
      include: { season: true },
      take: 12,
      orderBy: { updatedAt: "desc" },
    }),
    db().arenaParticipant.findMany({
      where: { userId: user.id, match: { mode } },
      orderBy: { match: { startedAt: "desc" } },
      take: 10,
      include: { match: true },
    }),
  ]);
  return (
    <main className="account-shell">
      <Link href="/account">← Conta</Link>
      <h1>RANKED · {season.name}</h1>
      <nav className="actions">
        <Link href="/arena">Jogar</Link>
        <Link href="/ranked">Arena 1v1</Link>
        <Link href="/ranked?mode=WAR_RANKED">Guerra 5v5</Link>
      </nav>
      <p>
        {rankOf(rating.mmr).name} · MMR {rating.mmr} · Pico {rating.peak} ·{" "}
        {rating.wins} vitórias / {rating.losses} derrotas · {rating.games}{" "}
        partidas
      </p>
      <p>
        Temporada encerra em {season.endsAt.toISOString().slice(0, 10)} UTC. Elo
        com K=32. A temporada seguinte aproxima 25% do rating de 1000. Busca
        começa em ±100 e cresce 50 a cada 30s, até ±500.
      </p>
      <p>
        Dez partidas habilitam recompensas pelo pico: 10–80 Ouro, 100–800 Gemas
        e moldura. Resgate abre uma hora após o fim. Nenhuma recompensa concede
        poder competitivo.
      </p>
      <h2>Classificação</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Jogador</th>
            <th>Rank</th>
            <th>MMR</th>
          </tr>
        </thead>
        <tbody>
          {leaders.map((r, i) => (
            <tr key={r.id}>
              <td>{i + 1}</td>
              <td>{r.user.username || r.user.name}</td>
              <td>{rankOf(r.mmr).name}</td>
              <td>{r.mmr}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Temporadas anteriores</h2>
      {past.map((r) => (
        <p key={r.id}>
          {r.season.name} · {rankOf(r.peak).name}{" "}
          <Claim seasonId={r.seasonId} mode={mode} />
        </p>
      ))}
      <h2>Histórico recente</h2>
      {recent.map((r) => (
        <p key={r.id}>
          {r.match.mode} · {r.match.startedAt.toISOString().slice(0, 16)} ·{" "}
          {r.match.status} ·{" "}
          {r.match.status === "COMPLETED"
            ? r.match.winner === null
              ? "Empate"
              : r.match.winner === r.team
                ? "Vitória"
                : "Derrota"
            : ""}
        </p>
      ))}
    </main>
  );
}
