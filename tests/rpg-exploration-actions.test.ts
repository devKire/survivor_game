import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { prepareExploration } from "../src/server/rpg/exploration/actions";
import { requireUser } from "../src/server/auth";
import { rpgProfileData } from "../src/server/rpg/profile";
import { currentTeam, createTeam, updateTeam } from "../src/server/teams";
import { safeCallback } from "../src/app/hub/navigation";
vi.mock("../src/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("../src/server/rpg/profile", () => ({ rpgProfileData: vi.fn() }));
vi.mock("../src/server/teams", () => ({
  currentTeam: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
}));
vi.mock("../src/server/security", async (original) => ({
  ...(await original<object>()),
  limit: vi.fn(),
}));
beforeEach(() => {
  vi.stubEnv("RPG_ENABLED", "true");
  vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
  vi.mocked(requireUser).mockResolvedValue({ id: "owner" } as Awaited<
    ReturnType<typeof requireUser>
  >);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
describe("exploration actions", () => {
  it("blocks flags, missing auth and unexpected ownership/reward input before any writes", async () => {
    vi.stubEnv("RPG_EXPLORATION_ENABLED", "false");
    expect((await prepareExploration({ regionId: "ruins-outskirts" })).ok).toBe(
      false,
    );
    expect(requireUser).not.toHaveBeenCalled();
    vi.stubEnv("RPG_EXPLORATION_ENABLED", "true");
    for (const key of ["userId", "materialId", "quantity", "seed", "x"])
      expect(
        (
          await prepareExploration({
            regionId: "ruins-outskirts",
            [key]: "fake",
          })
        ).ok,
      ).toBe(false);
    vi.mocked(requireUser).mockRejectedValue(new Error("database secret"));
    expect(await prepareExploration({ regionId: "ruins-outskirts" })).toEqual({
      ok: false,
      error: "Não foi possível preparar a exploração. Tente novamente.",
    });
    expect(createTeam).not.toHaveBeenCalled();
    expect(updateTeam).not.toHaveBeenCalled();
    expect(rpgProfileData).not.toHaveBeenCalled();
  });
  it("uses active character and authenticated owner, without trusting client build", async () => {
    vi.mocked(rpgProfileData).mockResolvedValue({
      activeCharacterId: "c",
      characters: [{ id: "c", characterId: "ivo" }],
    } as Awaited<ReturnType<typeof rpgProfileData>>);
    vi.mocked(currentTeam).mockResolvedValue({
      id: "t",
      leaderId: "owner",
      status: "LOBBY",
    } as Awaited<ReturnType<typeof currentTeam>>);
    expect(await prepareExploration({ regionId: "ruins-outskirts" })).toEqual({
      ok: true,
    });
    expect(updateTeam).toHaveBeenCalledWith("owner", {
      character: "ivo",
      expeditionKind: "RPG_EXPLORATION",
    });
    expect(safeCallback("/rpg/exploration")).toBe("/rpg/exploration");
    expect(safeCallback("//evil/rpg/discoveries")).toBe("/");
  });
});
