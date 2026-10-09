import "server-only";
import { isRpgEnabled, isRpgExpeditionsEnabled } from "../env";
import { UserError } from "../security";

export function requireRpgEnabled() {
  if (!isRpgEnabled()) throw new UserError("RPG indisponível.");
}

export function requireRpgExpeditionsEnabled() {
  if (!isRpgExpeditionsEnabled())
    throw new UserError("Expedições RPG indisponíveis.");
}
