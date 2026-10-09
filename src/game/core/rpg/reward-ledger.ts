import { RPG_EXPEDITION_V1 as policy } from "../../content/rpg/reward-profiles";
import type {
  RpgRewardEvent,
  RpgRewardParticipant,
  RpgTerminalResult,
} from "./loot-types";
import { validateTerminalResult } from "./reward-policy";

/** Bounded authority telemetry. No database IO, seeds, ordinary kills or client values. */
export class RpgRewardLedger {
  private elapsed = 0;
  private readonly events: RpgRewardEvent[] = [];
  private readonly participants = new Map<
    string,
    RpgRewardParticipant & { connected: number; active: number; absent: number }
  >();
  constructor(
    players: {
      userId: string;
      characterId: RpgRewardParticipant["characterId"];
      entryLevel: number;
    }[],
  ) {
    for (const p of players)
      this.participants.set(p.userId, {
        ...p,
        connectedTicks: 0,
        activeTicks: 0,
        absentTicks: 0,
        connected: 0,
        active: 0,
        absent: 0,
      });
  }
  step(dt: number) {
    this.elapsed = Math.min(policy.duration + 0.04, this.elapsed + dt);
  }
  participation(
    userId: string,
    dt: number,
    connected: boolean,
    moved: boolean,
  ) {
    const p = this.participants.get(userId)!;
    if (connected) {
      p.connected += dt;
      p.absent = 0;
      if (moved) p.active += dt;
    } else p.absent += dt;
  }
  event(
    source: RpgRewardEvent["source"],
    eventId: string,
    definitionId: string,
    userId: string | null = null,
  ) {
    if (
      this.events.length >= policy.maxEvents ||
      this.events.some((e) => e.eventId === eventId)
    )
      return;
    const same = this.events.filter(
      (e) => e.source === source && e.userId === userId,
    );
    const cap =
      source === "BOSS_DEFEAT"
        ? policy.maxBosses
        : source === "ELITE_DEFEAT"
          ? policy.maxElites
          : policy.maxChestsPerUser;
    if (
      same.length >= cap ||
      (source === "CHEST_OPENED" && (!userId || !this.participants.has(userId)))
    )
      return;
    this.events.push({
      source,
      eventId,
      definitionId,
      userId,
      tick: this.ticks(this.elapsed),
    });
  }
  terminal(victory: boolean): RpgTerminalResult {
    return validateTerminalResult({
      version: 1,
      outcome: victory ? "VICTORY" : "DEFEAT",
      ticks: this.ticks(this.elapsed),
      participants: [...this.participants.values()].map((p) => ({
        userId: p.userId,
        characterId: p.characterId,
        entryLevel: p.entryLevel,
        connectedTicks: this.ticks(p.connected),
        activeTicks: this.ticks(p.active),
        absentTicks: this.ticks(p.absent),
      })),
      events: this.events,
    });
  }
  private ticks(seconds: number) {
    return Math.min(15001, Math.floor(seconds * 25 + 0.00001));
  }
}
