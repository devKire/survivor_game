import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ArenaClient from "../src/app/arena/ArenaClient";

describe("competitive lobby mounting", () => {
  it("does not mount the game canvas or HUD before ARENA_STARTED", () => {
    const markup = renderToStaticMarkup(
      createElement(ArenaClient, {
        userId: "test-player",
        menuHeader: createElement("nav", null, "Lobby"),
      }),
    );
    expect(markup).not.toContain("<canvas");
    expect(markup).not.toContain("arena-game-overlay");
    expect(markup).toContain("Buscar partida");
  });
});
