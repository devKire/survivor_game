import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "dotenv";
import { chromium } from "@playwright/test";

// Local production harness. Never contacts a public deployment or starts the
// realtime authority. DATABASE_URL is supplied by the operator, never invented.
const local = (() => {
  try {
    return parse(readFileSync(".env"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
})();
const configured = { ...local, ...process.env, NODE_ENV: "production" };
assert(
  configured.DATABASE_URL?.trim(),
  "For scenario A, supply the existing DATABASE_URL locally.",
);
assert(
  configured.BETTER_AUTH_SECRET?.trim().length >= 32,
  "BETTER_AUTH_SECRET required for scenario A.",
);
assert(
  configured.REALTIME_SECRET?.trim().length >= 32,
  "REALTIME_SECRET required for scenario A.",
);

const next = "node_modules/next/dist/bin/next";
const publicFixture = "wss://runtime-test.example.test/socket";
const buildEnv = { ...configured, NEXT_PUBLIC_REALTIME_URL: publicFixture };
for (const name of [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "REALTIME_SECRET",
  "REALTIME_ORIGIN",
  "REALTIME_PORT",
])
  buildEnv[name] = ""; // Explicit empty values prevent loading local .env credentials.

async function build() {
  const child = spawn(process.execPath, [next, "build"], {
    env: buildEnv,
    stdio: "pipe",
  });
  // Do not print arbitrary build errors: dependencies might include env inputs.
  child.stdout.resume();
  child.stderr.resume();
  const [code] = await once(child, "exit");
  assert.equal(
    code,
    0,
    "Credential-free production build failed; inspect build separately with sanitized output.",
  );
  console.log("PASS: next build with empty database/auth/realtime secrets");
}

function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const name = `${path}/${entry.name}`;
    return entry.isDirectory() ? files(name) : [name];
  });
}

async function withServer(env, test) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(
    process.execPath,
    [next, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { env, stdio: "pipe" },
  );
  child.stdout.resume();
  child.stderr.resume();
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null)
        throw new Error("Production test server exited before readiness.");
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert(ready, "Production test server did not become ready.");
    await test(base);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}

await build();
const chunks = files(".next/static").filter((file) => file.endsWith(".js"));
assert(
  chunks.some((file) => readFileSync(file, "utf8").includes(publicFixture)),
  "Public WSS fixture must be inlined into a browser chunk.",
);
for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "REALTIME_SECRET"])
  assert(
    !chunks.some((file) =>
      readFileSync(file, "utf8").includes(configured[name]),
    ),
    `Private ${name} must not occur in browser chunks.`,
  );
console.log("PASS: WSS in browser bundle; private credentials absent");

// The auth URL is a test origin; no request is sent to this address.
const runtime = {
  ...configured,
  BETTER_AUTH_URL: "https://runtime-test.example.test",
  NEXT_PUBLIC_REALTIME_URL: "",
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const online of [true, false]) {
    await withServer(
      { ...runtime, DATABASE_URL: online ? configured.DATABASE_URL : "" },
      async (base) => {
        const response = await fetch(`${base}/api/debug/environment`);
        assert.equal(response.status, 200);
        assert(response.headers.get("cache-control").includes("no-store"));
        const report = await response.json();
        assert.equal(report.databaseUrlNonEmpty, online);
        assert.equal(report.realtimeBuildUrlPresent, true);
        assert.equal(report.realtimeBuildUrlValid, true);
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", () => errors.push("browser-error"));
        for (const route of ["login", "register"]) {
          await page.goto(`${base}/${route}`);
          if (online) await page.getByLabel("E-mail").waitFor();
          else {
            await page
              .getByRole("heading", { name: "Configuração necessária" })
              .waitFor();
            assert(
              (
                await page
                  .getByRole("alert")
                  .filter({ hasText: "DATABASE_URL" })
                  .textContent()
              ).includes(
                "DATABASE_URL não está disponível no ambiente do servidor",
              ),
            );
          }
        }
        if (!online) {
          const api = await fetch(`${base}/api/auth/get-session`);
          assert.equal(api.status, 503);
          for (const route of ["account", "solo"]) {
            const redirect = await fetch(`${base}/${route}`, {
              redirect: "manual",
            });
            assert.equal(redirect.status, 307);
            assert.equal(redirect.headers.get("location"), "/login");
          }
          await page.goto(`${base}/offline`);
          await page.getByRole("button", { name: "INICIAR EXPEDIÇÃO" }).click();
          await page
            .getByRole("button", { name: "ATRAVESSAR A NÉVOA" })
            .click();
          await page.getByRole("button", { name: "ESTOU PRONTO" }).click();
          await page.keyboard.down("d");
          await delay(1000);
          await page.keyboard.up("d");
          await page.keyboard.press("Escape");
          await page
            .getByRole("heading", { name: "Travessia suspensa" })
            .waitFor();
          assert(
            await page.evaluate(
              () =>
                JSON.parse(localStorage.getItem("limiar.save.v1")).activeRun.x >
                100,
            ),
          );
        }
        assert.equal(
          errors.length,
          0,
          "Browser must have no unhandled errors.",
        );
        await page.close();
        console.log(
          `PASS: same production build, DATABASE_URL ${online ? "configured -> auth forms" : "empty -> configuration notice, API 503, offline movement/save"}`,
        );
      },
    );
  }
} finally {
  await browser.close();
}
console.log(
  "Production runtime verification complete. Rebuild normally before deployment: this build contains a test WSS endpoint.",
);
