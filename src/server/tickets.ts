import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getRealtimeSecret } from "./env";
const schema = z
  .object({
    userId: z.string(),
    sessionId: z.string(),
    nonce: z.string(),
    expiresAt: z.number(),
  })
  .strict();
export function issueTicket(userId: string, sessionId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      sessionId,
      nonce: randomBytes(24).toString("hex"),
      expiresAt: Date.now() + 30000,
    }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", getRealtimeSecret())
      .update(payload)
      .digest("base64url")
  );
}
export function verifyTicket(ticket: string) {
  const [payload, sig, ...extra] = ticket.split(".");
  if (!payload || !sig || extra.length) throw new Error("Ticket inválido");
  const expected = createHmac("sha256", getRealtimeSecret())
      .update(payload)
      .digest(),
    actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error("Ticket inválido");
  const v = schema.parse(
    JSON.parse(Buffer.from(payload, "base64url").toString()),
  );
  if (v.expiresAt < Date.now() || v.expiresAt > Date.now() + 31000)
    throw new Error("Ticket expirado");
  return v;
}
