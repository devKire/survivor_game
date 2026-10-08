import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { selectCharacterInput } from "../src/server/rpg/mutations";

describe("RPG mutation boundary", () => {
  it("accepts only a strict, revisioned and idempotent character selection", () => {
    const valid = { requestId: randomUUID(), expectedRevision: 1, characterId: "nara" };
    expect(selectCharacterInput.parse(valid)).toEqual(valid);
    expect(() => selectCharacterInput.parse({ ...valid, grantXp: 999 })).toThrow();
    expect(() => selectCharacterInput.parse({ ...valid, requestId: "retry-me" })).toThrow();
    expect(() => selectCharacterInput.parse({ ...valid, expectedRevision: 0 })).toThrow();
    expect(() => selectCharacterInput.parse({ ...valid, characterId: "locked" })).toThrow();
  });
});
