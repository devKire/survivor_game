import "server-only";
import { isRpgEnabled, isRpgExpeditionsEnabled, isRpgRefugeEnabled } from "../env";
import { UserError } from "../security";

export function requireRpgEnabled() {
  if (!isRpgEnabled()) throw new UserError("RPG indisponível.");
}

export function requireRpgExpeditionsEnabled() {
  if (!isRpgExpeditionsEnabled())
    throw new UserError("Expedições RPG indisponíveis.");
}

export function requireRpgRefugeEnabled() {
  if (!isRpgRefugeEnabled()) throw new UserError("Refúgio indisponível.");
}
