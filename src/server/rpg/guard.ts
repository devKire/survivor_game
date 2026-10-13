import "server-only";
import { isRpgEnabled, isRpgExpeditionsEnabled, isRpgRefugeEnabled, isRpgExplorationEnabled } from "../env";
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

export function requireRpgExplorationEnabled() {
  if (!isRpgExplorationEnabled()) throw new UserError("Exploração RPG indisponível.");
}
