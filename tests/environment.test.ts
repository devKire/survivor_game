import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBetterAuthUrl,
  getDatabaseUrl,
  getRealtimeOrigin,
  getRealtimePort,
} from "../src/server/env";
import { configurationError } from "../src/server/config";
import { GET } from "../src/app/api/debug/environment/route";
import { getRealtimeUrl } from "../src/game/network/environment";
import { RealtimeClient } from "../src/game/network/client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Server environment is lazy, private and evaluated at request time", () => {
  it("distinguishes missing, empty and whitespace-only DATABASE_URL without throwing on import", async () => {
    for (const value of [undefined, "", "   "]) {
      vi.stubEnv("DATABASE_URL", value);
      expect(configurationError()).toContain(
        "DATABASE_URL não está disponível no ambiente do servidor",
      );
      expect(() => getDatabaseUrl()).toThrow("DATABASE_URL");
      const response = await GET();
      const body = await response.json();
      expect(body.databaseUrlPresent).toBe(value !== undefined);
      expect(body.databaseUrlNonEmpty).toBe(false);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("re-reads runtime env after the module was imported and never serializes secrets", async () => {
    // Credentials below are isolated test fixtures, never a deployment fallback.
    const database =
      "postgresql://fixture:private-marker@db.example.test/fixture";
    vi.stubEnv("DATABASE_URL", database);
    vi.stubEnv("BETTER_AUTH_SECRET", "auth-private-marker".repeat(3));
    vi.stubEnv("REALTIME_SECRET", "realtime-private-marker".repeat(3));
    vi.stubEnv("BETTER_AUTH_URL", "https://limiar.example.test");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    expect(configurationError()).toBeNull();
    expect(getDatabaseUrl()).toBe(database);
    const body = await (await GET()).json();
    expect(body.databaseUrlNonEmpty).toBe(true);
    expect(body.gitCommitSha).toBe("a".repeat(40));
    for (const [key, value] of Object.entries(body)) {
      if (!["nodeEnv", "vercelEnv", "gitCommitSha"].includes(key))
        expect(typeof value).toBe("boolean");
    }
    expect(JSON.stringify(body)).not.toContain("private-marker");
    expect(JSON.stringify(body)).not.toContain("postgresql");
    vi.stubEnv("DATABASE_URL", "");
    expect(configurationError()).toContain("DATABASE_URL");
  });

  it("sanitizes invalid database URL errors", () => {
    vi.stubEnv("DATABASE_URL", "invalid-private-marker");
    expect(configurationError()).toContain("DATABASE_URL");
    expect(configurationError()).not.toContain("private-marker");
  });

  it("requires non-whitespace secrets", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://db.example.test/fixture");
    vi.stubEnv("BETTER_AUTH_SECRET", " ".repeat(40));
    expect(configurationError()).toContain("BETTER_AUTH_SECRET");
    vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("REALTIME_SECRET", " ".repeat(40));
    expect(configurationError()).toContain("REALTIME_SECRET");
  });
});

describe("Production endpoints cannot silently use localhost or insecure transport", () => {
  it("requires HTTPS for auth and realtime origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const value of [
      undefined,
      "",
      "http://app.example.test",
      "https://localhost:3000",
    ]) {
      vi.stubEnv("BETTER_AUTH_URL", value);
      vi.stubEnv("REALTIME_ORIGIN", value);
      expect(() => getBetterAuthUrl()).toThrow("BETTER_AUTH_URL");
      expect(() => getRealtimeOrigin()).toThrow("REALTIME_ORIGIN");
    }
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.test");
    vi.stubEnv("REALTIME_ORIGIN", "https://app.example.test");
    expect(getBetterAuthUrl()).toBe("https://app.example.test");
    expect(getRealtimeOrigin()).toBe("https://app.example.test");
  });

  it("requires WSS in production and keeps the development default", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const value of [
      undefined,
      "",
      "ws://localhost:3001",
      "ws://rt.example.test",
      "wss://127.0.0.1",
      "https://rt.example.test",
    ]) {
      vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", value);
      expect(() => getRealtimeUrl()).toThrow();
    }
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", "wss://rt.example.test");
    expect(getRealtimeUrl()).toBe("wss://rt.example.test/");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", undefined);
    expect(getRealtimeUrl()).toBe("ws://localhost:3001/");
  });

  it("does not request tickets, open sockets or retry a missing production endpoint", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_REALTIME_URL", undefined);
    const ticket = vi.fn(),
      status = vi.fn(),
      socket = vi.fn();
    vi.stubGlobal("WebSocket", socket);
    const client = new RealtimeClient(ticket, vi.fn(), status);
    await client.connect();
    expect(ticket).not.toHaveBeenCalled();
    expect(socket).not.toHaveBeenCalled();
    expect(client.timer).toBeUndefined();
    expect(status).toHaveBeenLastCalledWith(
      expect.stringContaining("Multijogador indisponível"),
    );
  });

  it("validates the port only when the realtime process uses it", () => {
    for (const value of ["abc", "0", "65536", "3.5"]) {
      vi.stubEnv("REALTIME_PORT", value);
      expect(() => getRealtimePort()).toThrow("REALTIME_PORT");
    }
    vi.stubEnv("REALTIME_PORT", undefined);
    expect(getRealtimePort()).toBe(3001);
  });
});
