import "server-only";
import { hasDatabaseConfiguration } from "../../../../server/env";
import { getRealtimeUrl } from "../../../../game/network/environment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY: remove this entire route after comparing the affected deployment.
// No auth/database dependency: it must work when auth cannot initialize.
export async function GET() {
  let realtimeBuildUrlValid = false;
  try {
    getRealtimeUrl();
    realtimeBuildUrlValid = true;
  } catch {
    // Configuration only; never return exception objects or environment values.
  }
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  return Response.json(
    {
      databaseUrlPresent: process.env.DATABASE_URL !== undefined,
      databaseUrlNonEmpty: hasDatabaseConfiguration(),
      betterAuthSecretPresent: Boolean(process.env.BETTER_AUTH_SECRET?.trim()),
      betterAuthSecretValid:
        (process.env.BETTER_AUTH_SECRET?.trim().length ?? 0) >= 32,
      betterAuthUrlPresent: Boolean(process.env.BETTER_AUTH_URL?.trim()),
      realtimeSecretPresent: Boolean(process.env.REALTIME_SECRET?.trim()),
      realtimeSecretValid:
        (process.env.REALTIME_SECRET?.trim().length ?? 0) >= 32,
      realtimeOriginPresent: Boolean(process.env.REALTIME_ORIGIN?.trim()),
      realtimePortPresent: Boolean(process.env.REALTIME_PORT?.trim()),
      // Literal access = value compiled into this deployment's frontend.
      realtimeBuildUrlPresent: Boolean(
        process.env.NEXT_PUBLIC_REALTIME_URL?.trim(),
      ),
      realtimeBuildUrlValid,
      vercelUrlPresent: Boolean(process.env.VERCEL_URL?.trim()),
      nodeEnv: ["development", "test", "production"].includes(nodeEnv ?? "")
        ? nodeEnv
        : null,
      vercelEnv: ["production", "preview", "development"].includes(
        vercelEnv ?? "",
      )
        ? vercelEnv
        : null,
      gitCommitSha: sha && /^[a-f\d]{40}$/i.test(sha) ? sha : null,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
