import { createHash } from "node:crypto";
import { db } from "./db";
export class UserError extends Error {}
export function pair(a: string, b: string) {
  return [a, b].sort().join(":");
}
export async function limit(key: string, max: number, windowSeconds = 60) {
  const now = Date.now(),
    hashed = createHash("sha256").update(key).digest("hex");
  const rows = await db().$queryRaw<
    { count: number }[]
  >`INSERT INTO limiar."RateLimit" (id,key,count,"lastRequest") VALUES (${hashed},${hashed},1,${BigInt(now)}) ON CONFLICT (key) DO UPDATE SET count=CASE WHEN limiar."RateLimit"."lastRequest" < ${BigInt(now - windowSeconds * 1000)} THEN 1 ELSE limiar."RateLimit".count+1 END,"lastRequest"=CASE WHEN limiar."RateLimit"."lastRequest" < ${BigInt(now - windowSeconds * 1000)} THEN ${BigInt(now)} ELSE limiar."RateLimit"."lastRequest" END RETURNING count`;
  if (rows[0].count > max)
    throw new UserError("Muitas tentativas. Aguarde um minuto.");
}
