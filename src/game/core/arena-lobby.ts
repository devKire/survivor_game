import type { FighterSeed } from "./pvp";
import type { PvpCharacter } from "../content/pvp";
import type { WarRole } from "../content/war";
export const ARENA_LOBBY_CONFIG = {
  selectionSeconds: 35,
  countdownSeconds: 3,
  allowDuplicateCharactersPerTeam: true,
};
export type LobbySeat = FighterSeed & { locked: boolean };
export interface ArenaLobbyState {
  matchId: string;
  mode: string;
  remaining: number;
  countdown: boolean;
  seats: LobbySeat[];
}

/** Match preparation has no simulation, client clock or editable build. */
export class ArenaLobby {
  seats: LobbySeat[];
  deadline: number;
  countdownAt: number | null = null;
  private readonly initialRoles = new Map<string, WarRole>();
  constructor(
    readonly id: string,
    readonly mode: string,
    seeds: FighterSeed[],
    now = Date.now(),
  ) {
    this.seats = seeds.map((s) => ({
      ...s,
      cosmetics: { ...s.cosmetics },
      locked: !!s.isBot,
    }));
    for (const seat of this.seats)
      this.initialRoles.set(seat.id, seat.role || "SOLDADO");
    this.deadline = now + ARENA_LOBBY_CONFIG.selectionSeconds * 1000;
  }
  select(
    id: string,
    selection: {
      character?: PvpCharacter;
      role?: WarRole;
      cosmetics?: Record<string, string>;
    },
    now = Date.now(),
  ) {
    const seat = this.seats.find((s) => s.id === id);
    if (
      !seat ||
      seat.isBot ||
      seat.locked ||
      this.countdownAt !== null ||
      now >= this.deadline
    )
      return false;
    if (
      selection.character &&
      !ARENA_LOBBY_CONFIG.allowDuplicateCharactersPerTeam &&
      this.seats.some(
        (s) =>
          s.id !== id &&
          s.team === seat.team &&
          s.character === selection.character,
      )
    )
      return false;
    if (
      this.mode.endsWith("RANKED") &&
      (selection.role === "COMANDANTE" || selection.role === "CONSTRUTOR") &&
      this.seats.some(
        (s) => s.id !== id && s.team === seat.team && s.role === selection.role,
      )
    )
      return false;
    Object.assign(seat, selection);
    return true;
  }
  lock(id: string, now = Date.now()) {
    const seat = this.seats.find((s) => s.id === id);
    if (!seat || this.countdownAt !== null || now >= this.deadline)
      return false;
    seat.locked = true;
    return true;
  }
  advance(now = Date.now()) {
    if (
      this.countdownAt === null &&
      (now >= this.deadline || this.seats.every((s) => s.locked))
    ) {
      this.normalizeRankedRoles();
      this.seats.forEach((s) => (s.locked = true));
      this.countdownAt = now + ARENA_LOBBY_CONFIG.countdownSeconds * 1000;
    }
    return this.countdownAt !== null && now >= this.countdownAt;
  }
  private normalizeRankedRoles() {
    if (!this.mode.endsWith("RANKED")) return;
    for (const team of [0, 1]) {
      const seats = this.seats.filter((seat) => seat.team === team);
      for (const role of ["COMANDANTE", "CONSTRUTOR"] as const) {
        const assigned = seats.filter((seat) => seat.role === role);
        for (const duplicate of assigned.slice(1)) duplicate.role = "SOLDADO";
        if (assigned.length > 0) continue;
        const fallback =
          seats.find(
            (seat) =>
              seat.role === "SOLDADO" &&
              this.initialRoles.get(seat.id) === role,
          ) ||
          seats.find((seat) => seat.role === "SOLDADO") ||
          seats.find(
            (seat) => seat.role !== "COMANDANTE" && seat.role !== "CONSTRUTOR",
          );
        if (fallback) fallback.role = role;
      }
    }
  }
  state(now = Date.now()): ArenaLobbyState {
    return {
      matchId: this.id,
      mode: this.mode,
      remaining: Math.max(
        0,
        Math.ceil(((this.countdownAt ?? this.deadline) - now) / 1000),
      ),
      countdown: this.countdownAt !== null,
      seats: this.seats,
    };
  }
}
