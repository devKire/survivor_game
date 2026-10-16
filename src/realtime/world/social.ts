import { randomUUID } from "node:crypto";
import * as teams from "../../server/teams";
import { sendChat, chatInput } from "../../server/social";
import { limit, UserError } from "../../server/security";
import type { WorldCoordinator, WorldConnection } from "./coordinator";
import type { WorldCommand } from "../../game/network/world";
type Team = NonNullable<Awaited<ReturnType<typeof teams.currentTeam>>>;
interface Invite {
  id: string;
  sender: string;
  target: string;
  teamId: string;
  expires: number;
}
/** Team remains the sole group ledger. Zone population is independent of membership. */
export class WorldSocial {
  private invites = new Map<string, Invite>();
  private aliases = new Map<string, string>();
  private cache = new Map<string, Team>();
  constructor(private world: WorldCoordinator) {}
  private publicId(userId: string) {
    const live = this.world.presence.get(userId)?.avatar.publicId;
    if (live) return live;
    let id = this.aliases.get(userId);
    if (!id) {
      id = randomUUID();
      this.aliases.set(userId, id);
    }
    return id;
  }
  private nearby(c: WorldConnection, target: string | undefined) {
    const p = this.world.current(c),
      row = p.zone.interest.query(p.avatar.player).find((a) => a.id === target);
    const other =
      row && [...p.zone.avatars.values()].find((a) => a.publicId === row.id);
    if (!other || other.userId === c.userId)
      throw new UserError("Selecione outro aventureiro próximo.");
    return other.userId;
  }
  private emit(userId: string, team: Team | null) {
    const p = this.world.presence.get(userId);
    if (!p) return;
    p.connection.send({
      type: "WORLD_GROUP",
      leader: team ? this.publicId(team.leaderId) : null,
      members:
        team?.members.map((m) => ({
          id: this.publicId(m.userId),
          name: (
            m.user.displayUsername ??
            m.user.username ??
            "Aventureiro"
          ).slice(0, 100),
          online: this.world.presence.has(m.userId),
        })) ?? [],
      invites: [...this.invites.values()]
        .filter((i) => i.target === userId && i.expires > Date.now())
        .map((i) => ({
          id: i.id,
          sender: this.publicId(i.sender),
          name: this.world.presence.get(i.sender)?.avatar.name ?? "Aventureiro",
        })),
    });
  }
  async refresh(userId: string) {
    const team = await teams.currentTeam(userId);
    if (team) {
      this.cache.set(team.id, team);
      for (const m of team.members) this.emit(m.userId, team);
    } else {
      this.emit(userId, null);
      for (const [id, t] of this.cache)
        if (t.members.some((m) => m.userId === userId)) {
          this.cache.delete(id);
          for (const m of t.members)
            if (m.userId !== userId) {
              const updated = await teams.currentTeam(m.userId);
              if (updated) this.cache.set(updated.id, updated);
              this.emit(m.userId, updated);
            }
        }
    }
  }
  async departed(userId: string) {
    for (const [id, i] of this.invites)
      if (i.sender === userId || i.target === userId) this.invites.delete(id);
    await teams.transferOfflineLeader(userId, [...this.world.presence.keys()]);
    await this.refresh(userId);
  }
  async group(
    c: WorldConnection,
    v: Extract<WorldCommand, { type: "WORLD_GROUP" }>,
  ) {
    this.world.current(c, v.epoch);
    await limit("world-group:" + c.userId, 20, 60);
    if (v.action === "INVITE") {
      const target = this.nearby(c, v.target);
      if (await teams.currentTeam(target))
        throw new UserError("Este aventureiro já está em um grupo.");
      let team = await teams.currentTeam(c.userId);
      if (!team) team = await teams.createTeam(c.userId);
      if (
        team.status !== "LOBBY" ||
        team.leaderId !== c.userId ||
        team.members.length >= teams.MAX_PARTY
      )
        throw new UserError(
          "Somente o líder pode convidar para um grupo com vaga.",
        );
      if (
        [...this.invites.values()].filter((i) => i.target === target).length >=
          10 ||
        [...this.invites.values()].filter((i) => i.sender === c.userId)
          .length >= 5
      )
        throw new UserError("Aguarde os convites pendentes.");
      if (
        ![...this.invites.values()].some(
          (i) => i.target === target && i.teamId === team.id,
        )
      ) {
        const id = randomUUID();
        this.invites.set(id, {
          id,
          sender: c.userId,
          target,
          teamId: team.id,
          expires: Date.now() + 60000,
        });
      }
      await this.refresh(c.userId);
      await this.refresh(target);
      return;
    }
    if (v.action === "ACCEPT" || v.action === "DECLINE") {
      const invite = v.inviteId ? this.invites.get(v.inviteId) : undefined;
      if (!invite || invite.target !== c.userId || invite.expires < Date.now())
        throw new UserError("Convite expirado ou indisponível.");
      if (v.action === "ACCEPT") {
        const team = await teams.currentTeam(invite.sender);
        if (
          !team ||
          team.id !== invite.teamId ||
          team.leaderId !== invite.sender ||
          !this.world.has(invite.sender)
        )
          throw new UserError("O grupo mudou. Solicite outro convite.");
        this.world.current(c, v.epoch);
        await teams.joinTeam(c.userId, team.code);
      }
      this.invites.delete(invite.id);
      await this.refresh(c.userId);
      return;
    }
    const team = await teams.currentTeam(c.userId);
    if (v.action === "KICK") {
      const target = team?.members.find(
        (m) => this.publicId(m.userId) === v.target,
      );
      if (!target) throw new UserError("Membro indisponível.");
      await teams.leaveTeam(c.userId, target.userId);
      await this.refresh(target.userId);
    } else await teams.leaveTeam(c.userId);
    await this.refresh(c.userId);
  }
  async chat(
    c: WorldConnection,
    v: Extract<WorldCommand, { type: "WORLD_CHAT" }>,
  ) {
    const p = this.world.current(c, v.epoch);
    // Reuse the existing strict text validator for local messages too.
    const text = chatInput.shape.text.parse(v.text);
    const targets = new Set<string>([c.userId]);
    let id: string = randomUUID();
    if (v.scope === "LOCAL") {
      await limit("world-chat:" + c.userId, 20, 10);
      for (const userId of p.zone.avatars.keys()) targets.add(userId);
    } else if (v.scope === "GROUP") {
      const team = await teams.currentTeam(c.userId);
      if (!team) throw new UserError("Entre em um grupo para conversar.");
      const message = await sendChat(c.userId, {
        scope: "team",
        target: team.id,
        text,
      });
      id = message.id;
      for (const m of team.members) targets.add(m.userId);
    } else {
      const team = await teams.currentTeam(c.userId),
        member = team?.members.find(
          (m) => this.publicId(m.userId) === v.target,
        );
      const target = member?.userId ?? this.nearby(c, v.target);
      const message = await sendChat(c.userId, { scope: "dm", target, text });
      id = message.id;
      targets.add(target);
    }
    this.world.current(c, v.epoch);
    const message = {
      type: "WORLD_CHAT",
      id,
      scope: v.scope,
      sender: p.avatar.publicId,
      name: p.avatar.name,
      text,
      at: Date.now(),
    };
    for (const userId of targets)
      this.world.presence.get(userId)?.connection.send(message);
  }
  async maintenance() {
    for (const [id, i] of this.invites)
      if (i.expires < Date.now()) this.invites.delete(id);
    const visited = new Set<string>();
    for (const p of this.world.presence.values()) {
      if (visited.has(p.connection.userId)) continue;
      const team = await teams.currentTeam(p.connection.userId);
      if (team) {
        this.cache.set(team.id, team);
        for (const m of team.members) {
          visited.add(m.userId);
          this.emit(m.userId, team);
        }
      } else this.emit(p.connection.userId, null);
    }
    for (const [id, t] of this.cache)
      if (!t.members.some((m) => this.world.has(m.userId)))
        this.cache.delete(id);
    const keep = new Set(
      [...this.cache.values()].flatMap((t) => t.members.map((m) => m.userId)),
    );
    for (const id of this.aliases.keys())
      if (!keep.has(id)) this.aliases.delete(id);
  }
}
