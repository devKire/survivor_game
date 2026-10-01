import { CoopSimulation } from "../src/game/core/coop";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOSS_ART,
  ENEMY_ART,
  resolveCreatureArt,
} from "../src/game/client/creature-art";
import { assetUrl } from "../src/game/client/character-art";
import {
  creatureCodex,
  creatureCodexCard,
} from "../src/game/client/creature-codex";
import { BOSS_EVENTS, ENEMY_DEFINITIONS } from "../src/game/content/catalog";
import {
  CREATURE_DISCOVERY_IDS,
  creatureDiscoveryId,
} from "../src/game/content/creature-discovery";
import { GameSimulation } from "../src/game/core/simulation";
import { freshSave, migrateSave, saveSchema } from "../src/game/core/save";
import { WarSimulation } from "../src/game/core/war";

const paths = {
  husk: "errante_de_xisto",
  dart: "rasante",
  tank: "muralha_oca",
  swarm: "cisco_vivo",
  ranged: "cantor_de_fendas",
  elite: "arauto_de_basalto",
  boss: "custodio",
  burrower: "escavador_da_nevoa",
  sentinel: "sentinela_de_vidro",
  herald: "arauto_do_veu",
  charger: "rasgador_de_laje",
  splitter: "partilhado",
  shardling: "lasca_viva",
  weaver: "tecelão_da_mare",
};
const bossPaths = [
  "o_sineiro_de_pedra",
  "a_corça_de_cobre",
  "mae_das_fendas",
  "o_cartografo_cego",
  "a_catedral_errante",
  "o_peregrino_sem_face",
  "o_olho_sob_a_pedra",
  "o_rei_das_cinzas",
  "a_voz_do_abismo",
  "o_ultimo_custodio",
];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("creature artwork and discovery", () => {
  it.each(Object.entries(paths))(
    "resolves %s to its real portrait",
    (type, folder) => {
      expect(
        decodeURI(
          assetUrl(
            resolveCreatureArt({ type, name: ENEMY_DEFINITIONS[type].name })!
              .portrait,
          ),
        ),
      ).toContain(`/enemy/${folder}/portrait.png`);
    },
  );
  it.each(BOSS_EVENTS.map((b, i) => [b.name, bossPaths[i]]))(
    "resolves named boss %s",
    (name, folder) => {
      expect(
        decodeURI(
          assetUrl(resolveCreatureArt({ type: "boss", name })!.portrait),
        ),
      ).toContain(`/boss/${folder}/portrait.png`);
    },
  );
  it("uses the canonical final asset and keeps generic/last Custodian distinct", () => {
    expect(
      assetUrl(resolveCreatureArt({ type: "final", name: "" })!.portrait),
    ).toContain("/boss/a_boca_do_firmamento/");
    expect(resolveCreatureArt({ type: "boss", name: "unknown" })).toBe(
      ENEMY_ART.boss,
    );
    expect(BOSS_ART["O Último Custódio"].portrait).not.toBe(
      ENEMY_ART.boss.portrait,
    );
    expect(
      resolveCreatureArt({ type: "missing", name: "missing" }),
    ).toBeUndefined();
  });
  it("records specific spawn/restored bosses and preserves old saves without revealing named bosses", () => {
    const game = new GameSimulation(freshSave());
    game.start("nara", "normal", "ruins", "art-test");
    for (const boss of BOSS_EVENTS) game.spawnAt("boss", 500, 500, boss);
    game.spawnAt("boss", 500, 500);
    game.spawnAt("final", 500, 500);
    expect(game.save.discovered.enemies).toContain("boss:stone_bell");
    expect(game.save.discovered.enemies).toContain("boss:custodian");
    expect(new Set(BOSS_EVENTS.map((b) => b.id)).size).toBe(10);
    const restored = game.spawnAt("boss", 500, 500, null, {
      name: BOSS_EVENTS[1].name,
    })!;
    expect(creatureDiscoveryId(restored)).toBe("boss:copper_doe");
    const save = freshSave();
    save.gems = 321;
    save.discovered.enemies = [...CREATURE_DISCOVERY_IDS];
    expect(saveSchema.safeParse(save).success).toBe(true);
    expect(migrateSave(save).discovered.enemies).toEqual(
      save.discovered.enemies,
    );
    const old = {
      ...save,
      discovered: { ...save.discovered, enemies: ["boss", "final", "husk"] },
    };
    expect(migrateSave(old).gems).toBe(321);
    expect(creatureCodex(old.discovered.enemies)).not.toContain(
      "O Sineiro de Pedra",
    );
    expect(creatureCodex(old.discovered.enemies)).toContain(
      "A Boca do Firmamento",
    );
  });
  it("renders no real URL/name for locked creatures and includes discovered shardling and bosses", () => {
    const hidden = creatureCodex([]);
    expect(hidden).not.toContain("<img");
    expect(hidden).not.toContain("portrait.png");
    expect(hidden).not.toContain("Lasca Viva");
    const shown = creatureCodex(["shardling", "husk", "boss:copper_doe"]);
    expect(shown).toContain("Lasca Viva");
    expect(shown).toContain("a_cor");
    expect(shown).toContain("Perseguidor");
    expect(shown.match(/<img /g)).toHaveLength(3);
    expect(shown).not.toContain("O Sineiro de Pedra");
    expect(
      creatureCodexCard("boss", "O Sineiro de Pedra", false),
    ).not.toContain("src=");
  });
  it("shares named boss discovery with every co-op member", () => {
    const coop = new CoopSimulation(
      [0, 1].map((i) => ({
        id: `p${i}`,
        name: `P${i}`,
        character: "nara",
        progress: freshSave(),
      })),
      "normal",
      "ruins",
      "art-coop",
    );
    coop.spawnAt("boss", coop.player.x + 100, coop.player.y, BOSS_EVENTS[0]);
    coop.update(1 / 25);
    for (const member of coop.members.values())
      expect(member.progress.discovered.enemies).toContain("boss:stone_bell");
  });
  it("resolves actual War neutral snapshots through the same catalog", () => {
    const war = new WarSimulation(
      Array.from({ length: 10 }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        character: "nara",
        cosmetics: {},
        team: i < 5 ? 0 : 1,
        role: "SOLDADO",
        isBot: i > 1,
      })),
    );
    const boss = war.neutrals.enemies.find((e) => e.type === "boss")!;
    const player = war.fighters.get("p0")!.player;
    player.x = boss.x;
    player.y = boss.y + 100;
    const snapshotBoss = war
      .snapshot("p0")
      .war!.neutrals.find((e) => e.type === "boss")!;
    expect(snapshotBoss.name).toBe("A Corça de Cobre");
    expect(resolveCreatureArt(snapshotBoss)).toBe(BOSS_ART["A Corça de Cobre"]);
    expect(boss.name).toBe("A Corça de Cobre");
    expect(resolveCreatureArt(boss)).toBe(BOSS_ART["A Corça de Cobre"]);
    for (const e of war.neutrals.enemies)
      expect(resolveCreatureArt(e)).toBeDefined();
  });
});

describe("cached portrait drawing", () => {
  async function setup(ready: boolean) {
    vi.resetModules();
    const created: FakeImage[] = [];
    class FakeImage {
      naturalWidth = 1254;
      naturalHeight = 1254;
      onload?: () => void;
      onerror?: () => void;
      set src(_url: string) {
        created.push(this);
        if (ready) this.onload?.();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const { CreaturePortraitRenderer } =
      await import("../src/game/client/creature-portrait-renderer");
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
      imageSmoothingEnabled: true,
    };
    const enemy = {
      type: "husk",
      name: "Errante de Xisto",
      x: 10,
      y: 20,
      flash: 0,
    };
    return {
      renderer: new CreaturePortraitRenderer(),
      second: new CreaturePortraitRenderer(),
      ctx,
      enemy,
      created,
    };
  }
  it("shares one image across 1100 enemies and renderer instances, without rotation/crop", async () => {
    const { renderer, second, ctx, enemy, created } = await setup(true);
    for (let i = 0; i < 1100; i++)
      expect((i % 2 ? renderer : second).draw(ctx as never, enemy)).toBe(true);
    expect(created).toHaveLength(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1100);
    expect(ctx.drawImage.mock.calls[0]).toHaveLength(5);
    expect(ctx.drawImage.mock.calls[0].slice(1)).toEqual([
      10 - 32,
      20 + 6 - 64 * 0.86,
      64,
      64,
    ]);
    expect(ctx.save).toHaveBeenCalledTimes(1100);
    expect(ctx.restore).toHaveBeenCalledTimes(1100);
  });
  it("returns false during load, on error, for invalid dimensions and unknown art without retries", async () => {
    const { renderer, ctx, enemy, created } = await setup(false);
    expect(renderer.draw(ctx as never, enemy)).toBe(false);
    created[0].onerror?.();
    for (let i = 0; i < 100; i++)
      expect(renderer.draw(ctx as never, enemy)).toBe(false);
    expect(created).toHaveLength(1);
    expect(renderer.draw(ctx as never, { ...enemy, type: "unknown" })).toBe(
      false,
    );
    expect(renderer.draw(ctx as never, { ...enemy, type: "dart" })).toBe(false);
    created[1].naturalWidth = 0;
    created[1].onload?.();
    expect(renderer.draw(ctx as never, { ...enemy, type: "dart" })).toBe(false);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
  it("keeps legacy bodies, status overlays and debug circles when images fail", async () => {
    const { renderer, enemy, created, ctx } = await setup(false);
    renderer.draw(ctx as never, enemy);
    created[0].onerror?.();
    const { WorldRenderer } = await import("../src/game/client/world-renderer");
    const calls: Record<string, ReturnType<typeof vi.fn>> = {};
    const canvas = new Proxy(
      {},
      {
        get: (_target, key: string) => (calls[key] ??= vi.fn()),
        set: () => true,
      },
    );
    const world = new WorldRenderer({
      ctx: canvas,
      debug: { hitboxes: true },
    } as never);
    const game = new GameSimulation(freshSave());
    game.start("nara", "normal", "ruins", "fallback");
    const e = game.spawnAt("husk", 100, 120)!;
    e.wind = 1;
    world.enemy(e, 0);
    expect(calls.drawImage).toBeUndefined();
    expect(calls.lineTo).toHaveBeenCalled(); // actual fallback polygon body
    expect(calls.arc).toHaveBeenCalledWith(100, 120, e.r, 0, Math.PI * 2);
    expect(calls.arc).toHaveBeenCalledWith(100, 120, e.r + 28, 0, Math.PI * 2);
    expect(calls.save).toHaveBeenCalledTimes(1);
    expect(calls.restore).toHaveBeenCalledTimes(1);
  });
  it("is safe without browser Image during SSR", async () => {
    vi.resetModules();
    vi.stubGlobal("Image", undefined);
    const { CreaturePortraitRenderer } =
      await import("../src/game/client/creature-portrait-renderer");
    expect(
      new CreaturePortraitRenderer().draw({} as never, {
        type: "husk",
        name: "",
        x: 0,
        y: 0,
        flash: 0,
      }),
    ).toBe(false);
  });
});
