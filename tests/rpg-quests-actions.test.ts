import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  questCommand,
  dialogueCommand,
  refreshQuestJournal,
} from "../src/server/rpg/quests/actions";
import { requireUser } from "../src/server/auth";
import { mutateQuest, mutateDialogue } from "../src/server/rpg/quests/service";
import { UserError } from "../src/server/security";
import { safeCallback } from "../src/app/hub/navigation";
vi.mock("../src/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("../src/server/security", async (original) => ({
  ...(await original<object>()),
  limit: vi.fn(),
}));
vi.mock("../src/server/rpg/quests/service", async (original) => ({
  ...(await original<object>()),
  mutateQuest: vi.fn(),
  mutateDialogue: vi.fn(),
}));
const input = {
  kind: "ACCEPT",
  questId: "main:refuge-introduction",
  requestId: randomUUID(),
  expectedRevision: 1,
};
beforeEach(() => {
  vi.stubEnv("RPG_ENABLED", "true");
  vi.stubEnv("RPG_QUESTS_ENABLED", "true");
  vi.mocked(requireUser).mockResolvedValue({ id: "owner" } as Awaited<
    ReturnType<typeof requireUser>
  >);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
it("gates every action independently from exploration/refuge flags", async () => {
  vi.stubEnv("RPG_QUESTS_ENABLED", "false");
  for (const f of [questCommand, dialogueCommand, refreshQuestJournal])
    expect((await f({})).ok).toBe(false);
  expect(requireUser).not.toHaveBeenCalled();
  vi.stubEnv("RPG_QUESTS_ENABLED", "true");
  vi.stubEnv("RPG_ENABLED", "false");
  expect((await questCommand(input)).ok).toBe(false);
  expect(mutateQuest).not.toHaveBeenCalled();
});
it("authenticates and rejects unexpected client authority fields before services", async () => {
  vi.mocked(requireUser).mockRejectedValueOnce(
    new UserError("Entre na sua conta."),
  );
  expect(await questCommand(input)).toEqual({
    ok: false,
    error: "Entre na sua conta.",
  });
  for (const key of [
    "userId",
    "xp",
    "progress",
    "characterId",
    "reward",
    "proof",
  ])
    expect((await questCommand({ ...input, [key]: "other" })).ok).toBe(false);
  expect(mutateQuest).not.toHaveBeenCalled();
  expect(
    (
      await dialogueCommand({
        kind: "CHOOSE",
        npcId: "refuge:guide",
        choiceId: "briefing",
        expectedRevision: 1,
        requestId: randomUUID(),
        nodeId: "forged",
      })
    ).ok,
  ).toBe(false);
  expect(mutateDialogue).not.toHaveBeenCalled();
});
it("uses authenticated owner and hides internal errors while preserving safe feedback", async () => {
  vi.mocked(mutateQuest).mockRejectedValueOnce(
    new Error("postgres://secret-password"),
  );
  const result = await questCommand(input);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain("secret");
  expect(mutateQuest).toHaveBeenCalledWith("owner", input);
  vi.mocked(mutateQuest).mockRejectedValueOnce(
    new UserError("Atualize o diário."),
  );
  expect(await questCommand(input)).toEqual({
    ok: false,
    error: "Atualize o diário.",
  });
});
it("allows only safe quest callbacks", () => {
  expect(safeCallback("/rpg/quests")).toBe("/rpg/quests");
  for (const bad of [
    "//evil/rpg/quests",
    "https://evil/rpg/quests",
    "/rpg/quests\\evil",
    "/%2Frpg/quests",
  ])
    expect(safeCallback(bad)).toBe("/");
});
