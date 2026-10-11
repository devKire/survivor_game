import { describe, expect, it } from "vitest";
import { RPG_LOOT_TABLES_V1 } from "../src/game/content/rpg/loot-tables";
import { RPG_EXPEDITION_V1 } from "../src/game/content/rpg/reward-profiles";
import {
  validateLootTable,
  rollRpgLoot,
  weightedPick,
} from "../src/game/core/rpg/loot-rolls";
import { calculateRpgReward } from "../src/game/core/rpg/reward-calculator";
import { validateTerminalResult } from "../src/game/core/rpg/reward-policy";
import { applyRpgRewardXp } from "../src/game/core/rpg/xp-progression";
import {
  initialRpgAttributes,
  allocateAttributePoints,
  validateEquipment,
  RPG_MAX_XP,
} from "../src/game/core/rpg";
import {
  createRewardSeed,
  deriveRewardRollSeed,
} from "../src/server/rpg/reward-seeds";
import type { RpgTerminalResult } from "../src/game/core/rpg/loot-types";

const root = "ab".repeat(32);
const seed = (event: string) =>
  deriveRewardRollSeed(
    root,
    "session",
    "user",
    "EXPEDITION_COMPLETION",
    event,
    0,
    1,
  );
const terminal = (): RpgTerminalResult => ({
  version: 1,
  outcome: "VICTORY",
  ticks: 15000,
  participants: [
    {
      userId: "user",
      characterId: "nara",
      entryLevel: 5,
      connectedTicks: 15000,
      activeTicks: 1000,
      absentTicks: 0,
    },
  ],
  events: [],
});
const reward = (value: unknown) =>
  calculateRpgReward(value, "user", (source, event, roll, version) =>
    deriveRewardRollSeed(root, "session", "user", source, event, roll, version),
  );

describe("versioned RPG loot and reward policy", () => {
  it("validates immutable registered tables and rejects arbitrary content/weights/ranges", () => {
    for (const table of Object.values(RPG_LOOT_TABLES_V1))
      expect(validateLootTable(table)).toEqual(table);
    const table = structuredClone(RPG_LOOT_TABLES_V1["completion-v1"]);
    for (const input of [
      { ...table, version: 2 },
      { ...table, rolls: 100 },
      { ...table, entries: [] },
      { ...table, entries: [table.entries[0], table.entries[0]] },
      { ...table, entries: [{ ...table.entries[0], definitionId: "missing" }] },
      { ...table, entries: [{ ...table.entries[0], weight: 0 }] },
      { ...table, entries: [{ ...table.entries[0], weight: 1.2 }] },
      { ...table, entries: [{ ...table.entries[0], maximumItemLevel: 0 }] },
      {
        ...table,
        entries: [
          {
            ...table.entries[0],
            rarityWeights: { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 },
          },
        ],
      },
    ])
      expect(() => validateLootTable(input)).toThrow();
    expect(() => {
      RPG_LOOT_TABLES_V1["completion-v1"].entries[0].weight = 9000;
    }).toThrow();
    for (const random of [-1, 1, NaN, Infinity])
      expect(() => weightedPick([1], (x) => x, random)).toThrow();
  });
  it("domain-separates root secrets from world seeds, users, events and versions", () => {
    expect(createRewardSeed()).toMatch(/^[a-f0-9]{64}$/);
    expect(createRewardSeed()).not.toBe(createRewardSeed());
    expect(seed("event")).toBe(seed("event"));
    expect(seed("event")).not.toBe(seed("other"));
    expect(seed("event")).not.toBe(
      deriveRewardRollSeed(
        root,
        "session",
        "other",
        "EXPEDITION_COMPLETION",
        "event",
        0,
        1,
      ),
    );
    expect(() =>
      deriveRewardRollSeed("public-world", "s", "u", "BOSS_DEFEAT", "e", 0, 1),
    ).toThrow();
    expect(() =>
      deriveRewardRollSeed(root, "s", "u", "BOSS_DEFEAT", "e", 0, 2),
    ).toThrow();
  });
  it("replays 3000 loot rolls with valid equipment and weighted rarity distribution", () => {
    const counts = { COMMON: 0, RARE: 0, EPIC: 0, LEGENDARY: 0 };
    for (let i = 0; i < 3000; i++) {
      const roll = rollRpgLoot(
        RPG_LOOT_TABLES_V1["completion-v1"],
        1,
        seed(String(i)),
      );
      expect(roll).toEqual(
        rollRpgLoot(RPG_LOOT_TABLES_V1["completion-v1"], 1, seed(String(i))),
      );
      expect(roll.type).toBe("EQUIPMENT");
      if (roll.type === "EQUIPMENT") {
        counts[roll.item.rarity]++;
        expect(validateEquipment(roll.item)).toEqual(roll.item);
        expect(roll.item.level).toBe(1);
      }
    }
    expect(counts.COMMON).toBeGreaterThan(2250);
    expect(counts.COMMON).toBeLessThan(2550);
    expect(counts.RARE).toBeGreaterThan(450);
    expect(counts.EPIC).toBeGreaterThan(25);
    expect(counts.LEGENDARY).toBe(0);
  });
  it("handles every boss loot entry, seeded affixes and level bounds", () => {
    const definitions = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const roll = rollRpgLoot(
        RPG_LOOT_TABLES_V1["boss-v1"],
        100,
        seed("boss-" + i),
      );
      if (roll.type === "EQUIPMENT") {
        definitions.add(roll.item.itemId);
        expect(roll.item.level).toBeGreaterThanOrEqual(98);
        expect(roll.item.level).toBeLessThanOrEqual(100);
        validateEquipment(roll.item);
      } else {
        definitions.add(roll.materialId);
        expect(roll.quantity).toBeLessThanOrEqual(4);
      }
    }
    expect(definitions.size).toBe(8);
    expect(() =>
      rollRpgLoot(RPG_LOOT_TABLES_V1["boss-v1"], 101, seed("x")),
    ).toThrow();
  });
  it("awards bounded completion, bosses, elites and personal chests in stable order", () => {
    const value = terminal();
    for (let i = 0; i < 3; i++)
      value.events.push({
        eventId: "boss" + i,
        source: "BOSS_DEFEAT",
        definitionId: "boss:" + i,
        tick: 100,
        userId: null,
      });
    for (let i = 0; i < 6; i++)
      value.events.push({
        eventId: "elite" + i,
        source: "ELITE_DEFEAT",
        definitionId: "elite",
        tick: 100,
        userId: null,
      });
    for (let i = 0; i < 3; i++)
      value.events.push({
        eventId: "chest" + i,
        source: "CHEST_OPENED",
        definitionId: "chest",
        tick: 100,
        userId: "user",
      });
    const result = reward(value);
    expect(result.xp).toBe(181);
    expect(result.equipment.length).toBeGreaterThanOrEqual(1);
    expect(result.equipment.length).toBeLessThanOrEqual(4);
    expect(result.origins).toHaveLength(13);
    expect(reward({ ...value, events: [...value.events].reverse() })).toEqual(
      result,
    );
    expect(() =>
      reward({ ...value, events: [...value.events, value.events[0]] }),
    ).toThrow();
    expect(() =>
      reward({
        ...value,
        events: [...value.events, { ...value.events[0], eventId: "fourth" }],
      }),
    ).toThrow();
  });
  it("rejects invented evidence, unknown users/versions and premature victory", () => {
    for (const patch of [
      { version: 2 },
      { ticks: 14999 },
      {
        participants: [...terminal().participants, ...terminal().participants],
      },
      {
        events: [
          {
            eventId: "e",
            source: "BOSS_DEFEAT",
            definitionId: "fake",
            userId: null,
            tick: 1,
          },
        ],
      },
      {
        events: [
          {
            eventId: "e",
            source: "CHEST_OPENED",
            definitionId: "chest",
            userId: "foreign",
            tick: 1,
          },
        ],
      },
      {
        events: [
          {
            eventId: "e",
            source: "ELITE_DEFEAT",
            definitionId: "elite",
            userId: null,
            tick: 15001,
          },
        ],
      },
    ])
      expect(() =>
        validateTerminalResult({ ...terminal(), ...patch }),
      ).toThrow();
    expect(() =>
      calculateRpgReward(terminal(), "foreign", () => seed("x")),
    ).toThrow();
  });
  it("gives no rewards on defeat, inadequate participation, inactivity or expired disconnect", () => {
    for (const result of [
      reward({ ...terminal(), outcome: "DEFEAT", ticks: 15000 }),
      ...[
        { connectedTicks: 8999 },
        { activeTicks: 749 },
        { absentTicks: 1501 },
      ].map((patch) =>
        reward({
          ...terminal(),
          participants: [{ ...terminal().participants[0], ...patch }],
        }),
      ),
    ]) {
      expect(result.xp).toBe(0);
      expect(result.equipment).toEqual([]);
      expect(result.materials).toEqual([]);
      expect(result.eligibility).not.toBe("ELIGIBLE");
    }
    expect(
      reward({
        ...terminal(),
        participants: [{ ...terminal().participants[0], absentTicks: 1500 }],
      }).eligibility,
    ).toBe("ELIGIBLE");
  });
  it("keeps per-user rolls independent and excludes another player's chests", () => {
    const value = terminal();
    value.participants.push({ ...value.participants[0], userId: "other" });
    value.events.push({
      eventId: "other-chest",
      source: "CHEST_OPENED",
      definitionId: "chest",
      tick: 100,
      userId: "other",
    });
    expect(reward(value).xp).toBe(100);
    const other = calculateRpgReward(
      value,
      "other",
      (source, event, i, version) =>
        deriveRewardRollSeed(
          root,
          "session",
          "other",
          source,
          event,
          i,
          version,
        ),
    );
    expect(other.xp).toBe(103);
    expect(other.equipment[0].id).not.toBe(reward(value).equipment[0].id);
  });
});
describe("authoritative XP arithmetic", () => {
  it("levels up using total XP and recomputes budget while preserving allocations", () => {
    const before = {
      ...allocateAttributePoints(initialRpgAttributes(2), "power", 3),
      xp: 390,
    };
    const result = applyRpgRewardXp(before, 100);
    expect(result).toMatchObject({
      level: 3,
      xp: 490,
      xpGranted: 100,
      attributePoints: 7,
      attributes: { power: 3 },
    });
    expect(
      applyRpgRewardXp({ ...initialRpgAttributes(), xp: 899 }, 200),
    ).toMatchObject({ level: 4, attributePoints: 15 });
  });
  it("saturates XP and preserves legacy level and points on zero or capped XP", () => {
    expect(
      applyRpgRewardXp(
        { ...initialRpgAttributes(100), xp: RPG_MAX_XP - 1 },
        100,
      ),
    ).toMatchObject({
      xp: RPG_MAX_XP,
      xpGranted: 1,
      level: 100,
      attributePoints: 495,
    });
    expect(
      applyRpgRewardXp({ ...initialRpgAttributes(5), xp: 0 }, 100).level,
    ).toBe(5);
    expect(
      applyRpgRewardXp({ ...initialRpgAttributes(), xp: 400 }, 0).level,
    ).toBe(1);
    for (const amount of [-1, 0.5, NaN, Infinity, RPG_EXPEDITION_V1.maxXp + 1])
      expect(() =>
        applyRpgRewardXp({ ...initialRpgAttributes(), xp: 0 }, amount),
      ).toThrow();
  });
});
