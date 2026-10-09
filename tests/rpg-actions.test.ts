import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../src/server/security";
import { requireUser } from "../src/server/auth";
import {
  allocateRpgAttributes,
  selectRpgCharacter,
  mutateRpgEquipment,
} from "../src/server/rpg/mutations";
import {
  allocateRpgAttributesAction,
  selectRpgCharacterAction,
  mutateRpgEquipmentAction,
} from "../src/server/rpg/actions";
import { loginHref, safeCallback } from "../src/app/hub/navigation";
import { randomUUID } from "node:crypto";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../src/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("../src/server/security", async (original) => ({
  ...(await original<object>()),
  limit: vi.fn(),
}));
vi.mock("../src/server/rpg/mutations", async (original) => ({
  ...(await original<object>()),
  selectRpgCharacter: vi.fn(),
  allocateRpgAttributes: vi.fn(),
  mutateRpgEquipment: vi.fn(),
}));
const idle = { status: "idle", message: "" } as const;
const actions = [
  selectRpgCharacterAction,
  allocateRpgAttributesAction,
  mutateRpgEquipmentAction,
];
function form(allocation = false) {
  const value = new FormData();
  value.set("requestId", randomUUID());
  value.set("expectedRevision", "1");
  value.set("characterId", "nara");
  if (allocation) {
    value.set("attribute", "vitality");
    value.set("amount", "1");
  }
  return value;
}
beforeEach(() => {
  vi.stubEnv("RPG_ENABLED", "true");
  vi.mocked(requireUser).mockResolvedValue({
    id: "authenticated-owner",
  } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(selectRpgCharacter).mockResolvedValue({
    revision: 2,
    characterId: "nara",
  });
  vi.mocked(allocateRpgAttributes).mockResolvedValue({
    revision: 2,
    characterId: "nara",
  });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

describe("RPG Server Action security", () => {
  it("blocks every action while off without auth or writes", async () => {
    vi.stubEnv("RPG_ENABLED", "false");
    for (const action of actions)
      expect(await action(idle, form())).toEqual({
        status: "error",
        message: "RPG indisponível.",
      });
    expect(requireUser).not.toHaveBeenCalled();
    expect(selectRpgCharacter).not.toHaveBeenCalled();
    expect(allocateRpgAttributes).not.toHaveBeenCalled();
    expect(mutateRpgEquipment).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated calls before mutations", async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new UserError("Entre na sua conta para continuar."),
    );
    for (const action of actions)
      expect((await action(idle, form())).message).toContain(
        "Entre na sua conta",
      );
    expect(selectRpgCharacter).not.toHaveBeenCalled();
    expect(allocateRpgAttributes).not.toHaveBeenCalled();
  });
  it("rejects extra keys including userId, duplicates, files, coercion tricks and foreign identifiers", async () => {
    for (const key of ["userId", "xp", "itemId", "__proto__", "amount"]) {
      const value = form();
      value.set(key, "other-user");
      expect((await selectRpgCharacterAction(idle, value)).status).toBe(
        "error",
      );
    }
    for (const bad of ["1.5", "true", "1e1", " ", "0", "2147483647"]) {
      const value = form();
      value.set("expectedRevision", bad);
      expect((await selectRpgCharacterAction(idle, value)).status).toBe(
        "error",
      );
    }
    const duplicate = form();
    duplicate.append("characterId", "ivo");
    expect((await selectRpgCharacterAction(idle, duplicate)).status).toBe(
      "error",
    );
    const file = form();
    file.set("characterId", new Blob(["nara"]));
    expect((await selectRpgCharacterAction(idle, file)).status).toBe("error");
    const forged = form(true);
    forged.set("userId", "other-user");
    expect((await allocateRpgAttributesAction(idle, forged)).status).toBe(
      "error",
    );
    expect(selectRpgCharacter).not.toHaveBeenCalled();
    expect(allocateRpgAttributes).not.toHaveBeenCalled();
  });
  it("uses the current session even when previous form state is forged", async () => {
    const value = form();
    value.set("$ACTION_ID_test", "transport-metadata");
    expect(
      (
        await selectRpgCharacterAction(
          { ...idle, userId: "attacker" } as typeof idle,
          value,
        )
      ).status,
    ).toBe("success");
    expect(selectRpgCharacter).toHaveBeenCalledWith(
      "authenticated-owner",
      expect.objectContaining({ expectedRevision: 1, characterId: "nara" }),
    );
    expect((await allocateRpgAttributesAction(idle, form(true))).status).toBe(
      "success",
    );
    expect(allocateRpgAttributes).toHaveBeenCalledWith(
      "authenticated-owner",
      expect.objectContaining({ amount: 1 }),
    );
  });
  it("returns revision feedback and masks internal errors", async () => {
    vi.mocked(selectRpgCharacter).mockRejectedValue(
      new UserError("O perfil RPG mudou em outra aba. Atualize a página."),
    );
    expect((await selectRpgCharacterAction(idle, form())).message).toContain(
      "outra aba",
    );
    vi.mocked(selectRpgCharacter).mockRejectedValue(
      new Error("postgresql://secret-host private-marker"),
    );
    const result = await selectRpgCharacterAction(idle, form());
    expect(result.status).toBe("error");
    expect(result.message).not.toMatch(/postgresql|secret-host|private-marker/);
  });
  it("allows exact RPG callbacks without opening external redirect paths", () => {
    for (const path of ["/rpg/character", "/rpg/inventory"]) {
      expect(safeCallback(path)).toBe(path);
      expect(loginHref(path)).toContain(encodeURIComponent(path));
    }
    for (const path of [
      "//evil.test",
      "https://evil.test",
      "/%2frpg/character",
      "/rpg/character/../..",
      "/rpg/character\\evil",
    ])
      expect(safeCallback(path)).toBe("/");
  });
  it("equipment actions accept only intent and derive ownership from authentication", async () => {
    vi.mocked(mutateRpgEquipment).mockResolvedValue({
      revision: 2,
      characterId: "nara",
    });
    const value = form();
    value.set("operation", "EQUIP_ITEM");
    value.set("instanceId", "owned-instance");
    value.set("slot", "WEAPON");
    expect((await mutateRpgEquipmentAction(idle, value)).status).toBe(
      "success",
    );
    expect(mutateRpgEquipment).toHaveBeenCalledWith(
      "authenticated-owner",
      expect.objectContaining({
        instanceId: "owned-instance",
        operation: "EQUIP_ITEM",
      }),
    );
    vi.mocked(mutateRpgEquipment).mockClear();
    for (const key of [
      "userId",
      "affixes",
      "rollSeed",
      "contentVersion",
      "stats",
      "rarity",
      "level",
    ]) {
      value.set(key, "forged");
      expect((await mutateRpgEquipmentAction(idle, value)).status).toBe(
        "error",
      );
      value.delete(key);
    }
    value.append("slot", "ARMOR");
    expect((await mutateRpgEquipmentAction(idle, value)).status).toBe("error");
    expect(mutateRpgEquipment).not.toHaveBeenCalled();
    value.delete("slot");
    value.set("slot", "WEAPON");
    vi.mocked(mutateRpgEquipment).mockRejectedValue(
      new UserError("O perfil RPG mudou em outra aba. Atualize a página."),
    );
    expect((await mutateRpgEquipmentAction(idle, value)).message).toContain(
      "outra aba",
    );
    vi.mocked(mutateRpgEquipment).mockRejectedValue(
      new Error("postgresql://sensitive-host"),
    );
    expect((await mutateRpgEquipmentAction(idle, value)).message).not.toContain(
      "sensitive-host",
    );
  });
});
