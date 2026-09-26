import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  removeSeats: vi.fn(),
  lock: vi.fn(),
  grant: vi.fn(),
  save: vi.fn(),
  updateParticipant: vi.fn(),
  rate: vi.fn(),
}));
vi.mock("../src/server/db", () => ({
  db: () => ({
    userCosmetic: {
      findMany: async () => [{ cosmeticId: "character_skin_0" }],
    },
  }),
}));
vi.mock("../src/server/progress", () => ({
  progress: async () => ({ data: {} }),
}));
vi.mock("../src/server/security", () => ({
  UserError: class extends Error {},
  limit: async () => {},
}));
vi.mock("../src/server/ranked", () => ({
  currentSeason: vi.fn(),
  getRating: vi.fn(),
  settleRating: mocks.rate,
}));
vi.mock("../src/server/economy", () => ({
  economyJson: (v: unknown) => v,
  lockProgress: mocks.lock,
  grantCurrency: mocks.grant,
  persistSave: mocks.save,
  economyTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      teamMember: { findMany: async () => [] },
      arenaMatch: {
        create: mocks.create,
        update: mocks.update,
        updateMany: async () => ({ count: 1 }),
      },
      arenaSeat: { deleteMany: mocks.removeSeats },
      currencyTransaction: { count: async () => 0 },
      arenaParticipant: { update: mocks.updateParticipant },
    }),
}));
import { ArenaService } from "../src/realtime/arena";
import { freshSave } from "../src/game/core/save";
import type { QueueEntry } from "../src/game/core/matchmaking";
const entry = (i: number): QueueEntry => ({
  id: `u${i}`,
  name: `Human ${i}`,
  character: "nara",
  cosmetics: {},
  role: "SOLDADO",
  joined: Date.now() - 46000,
  mode: "WAR_CASUAL",
  mmr: 1000,
  seasonId: null,
});
function service(count = 2) {
  const s = new ArenaService(vi.fn());
  for (let i = 0; i < count; i++) {
    const e = entry(i);
    s.connected.add(e.id);
    s.queue.set(e.id, e);
  }
  return s;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({
    id: "match",
    mode: "WAR_CASUAL",
    seasonId: null,
  });
  mocks.lock.mockImplementation(async () => ({ save: freshSave() }));
});
describe("V27 atomic queue and bot settlement", () => {
  it("validates ownership in lobby, broadcasts selection and rejects edits after lock", async () => {
    const s = service();
    await s.pair();
    await s.handle("u0", "Human", {
      type: "ARENA_SELECT_CHARACTER",
      character: "orin",
    });
    await expect(
      s.handle("u0", "Human", {
        type: "ARENA_SELECT_COSMETIC",
        slot: "CHARACTER_SKIN",
        id: "character_skin_4",
      }),
    ).rejects.toThrow();
    await s.handle("u0", "Human", {
      type: "ARENA_SELECT_COSMETIC",
      slot: "CHARACTER_SKIN",
      id: "character_skin_0",
    });
    const seat = s.lobbies
      .get("match")!
      .lobby.seats.find((p) => p.id === "u0")!;
    expect(seat.character).toBe("orin");
    expect(seat.cosmetics.CHARACTER_SKIN).toBe("character_skin_0");
    expect(s.send).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ type: "ARENA_LOBBY_STATE" }),
    );
    await s.handle("u0", "Human", { type: "ARENA_LOCK_SELECTION" });
    await expect(
      s.handle("u0", "Human", {
        type: "ARENA_SELECT_CHARACTER",
        character: "ivo",
      }),
    ).rejects.toThrow();
    s.disconnect("u0");
    s.reconnect("u0");
    expect(s.send).toHaveBeenLastCalledWith(
      "u0",
      expect.objectContaining({ type: "ARENA_LOBBY_STATE" }),
    );
  });
  it("concurrent ticks create one match with two human seats and ten playable entities", async () => {
    const s = service();
    await Promise.all([s.pair(), s.pair(), s.pair()]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(s.matches.size).toBe(0);
    expect(s.lobbies.size).toBe(1);
    const lobby = s.lobbies.get("match")!.lobby;
    expect(lobby.seats).toHaveLength(10);
    expect(
      lobby.seats.filter((seat) => seat.isBot).every((seat) => seat.locked),
    ).toBe(true);
    lobby.lock("u0");
    lobby.lock("u1");
    s.update();
    expect(s.matches.size).toBe(0);
    lobby.countdownAt = Date.now() - 1;
    s.update();
    expect(s.matches.size).toBe(1);
    expect(s.active.size).toBe(2);
    expect(s.queue.size).toBe(0);
    expect(s.matches.get("match")!.game.fighters.size).toBe(10);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.participants.create).toHaveLength(2);
    expect(data.seats.create).toHaveLength(2);
    const m = s.matches.get("match")!;
    m.game.time = 60;
    m.game.winner = 0;
    for (const f of m.game.fighters.values()) f.humanCasts = 10;
    await s.settle(m);
    expect(mocks.lock).toHaveBeenCalledTimes(2);
    expect(
      mocks.lock.mock.calls.every((c) => !String(c[1]).startsWith("bot:")),
    ).toBe(true);
    expect(
      mocks.grant.mock.calls
        .filter((c) => c[2].currency === "GEMS")
        .map((c) => c[2].amount)
        .sort((a, b) => a - b),
    ).toEqual([6, 12]);
    expect(mocks.rate).not.toHaveBeenCalled();
  });
  it("cancel/disconnect clear the queue; one human cannot start", async () => {
    const s = service(3);
    await s.handle("u0", "Human", { type: "ARENA_CANCEL" });
    s.disconnect("u1");
    await s.pair();
    expect([...s.queue.keys()]).toEqual(["u2"]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("cancel during persistence interrupts the reservation and removes seats", async () => {
    let resolve!: (m: unknown) => void;
    mocks.create.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const s = service();
    const pending = s.pair();
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await s.handle("u0", "Human", { type: "ARENA_CANCEL" });
    resolve({ id: "match", mode: "WAR_CASUAL", seasonId: null });
    await pending;
    expect(s.active.size).toBe(0);
    expect(s.matches.size).toBe(0);
    expect(s.lobbies.size).toBe(0);
    expect(s.reserved.size).toBe(0);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "INTERRUPTED" }),
      }),
    );
    expect(mocks.removeSeats).toHaveBeenCalledTimes(1);
  });
  it("cancels a formed lobby for every human before the match starts", async () => {
    const s = service();
    await s.pair();
    await s.handle("u0", "Human", { type: "ARENA_CANCEL" });
    expect(s.lobbies.size).toBe(0);
    expect(s.active.size).toBe(0);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "INTERRUPTED" }),
      }),
    );
    expect(mocks.removeSeats).toHaveBeenCalledTimes(1);
    expect(s.send).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        type: "ARENA_RESULT",
        reason: "lobby-cancelled",
      }),
    );
  });
});
