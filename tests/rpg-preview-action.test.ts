import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "../src/server/auth";
import { rpgProfileData } from "../src/server/rpg/profile";
import { compareRpgItemAction } from "../src/server/rpg/preview-action";
import { UserError } from "../src/server/security";
import { clientMessage } from "../src/game/network/protocol";
import { safeCallback } from "../src/app/hub/navigation";
vi.mock("../src/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("../src/server/rpg/profile", () => ({ rpgProfileData: vi.fn() }));
vi.mock("../src/server/security", async (original) => ({
  ...(await original<object>()),
  limit: vi.fn(),
}));
beforeEach(() => {
  vi.stubEnv("RPG_ENABLED", "true");
  vi.mocked(requireUser).mockResolvedValue({ id: "owner" } as Awaited<
    ReturnType<typeof requireUser>
  >);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("RPG preview and reward input security", () => {
  const input = { characterId: "nara", instanceId: "item" };
  it("gates read actions before auth and database access", async () => {
    vi.stubEnv("RPG_ENABLED", "false");
    expect(await compareRpgItemAction(input)).toEqual({
      ok: false,
      error: "RPG indisponível.",
    });
    expect(requireUser).not.toHaveBeenCalled();
    vi.stubEnv("RPG_ENABLED", "true");
    vi.mocked(requireUser).mockRejectedValue(
      new UserError("Entre na sua conta."),
    );
    expect((await compareRpgItemAction(input)).ok).toBe(false);
    expect(rpgProfileData).not.toHaveBeenCalled();
  });
  it("rejects scope forgery and hides internal exceptions", async () => {
    expect(
      (await compareRpgItemAction({ ...input, userId: "foreign" })).ok,
    ).toBe(false);
    expect(rpgProfileData).not.toHaveBeenCalled();
    vi.mocked(rpgProfileData).mockRejectedValue(
      new Error("postgres://private password"),
    );
    const result = await compareRpgItemAction(input);
    expect(rpgProfileData).toHaveBeenCalledWith("owner");
    expect(JSON.stringify(result)).not.toMatch(/postgres|private|password/);
  });
  it("accepts only bounded gameplay intentions, never grant or terminal declarations", () => {
    for (const input of [
      { type: "GRANT_RPG", xp: 100 },
      { type: "RESULT", completed: true },
      { type: "START", rewardSeed: "a".repeat(64) },
      { type: "CONFIG", expeditionKind: "RPG_EXPEDITION", userId: "foreign" },
      {
        type: "INPUT",
        sequence: 1,
        moveX: 0,
        moveY: 0,
        interact: false,
        kills: 100,
      },
    ])
      expect(clientMessage.safeParse(input).success).toBe(false);
    expect(
      clientMessage.safeParse({
        type: "CONFIG",
        expeditionKind: "RPG_EXPEDITION",
      }).success,
    ).toBe(true);
    for (const path of ["/rpg/expeditions", "/rpg/rewards?sessionId=abc"])
      expect(safeCallback(path)).toBe(path);
    for (const path of [
      "//evil/rpg/rewards",
      "/rpg/rewards/../evil",
      "/rpg/rewards\\evil",
    ])
      expect(safeCallback(path)).toBe("/");
  });
});
