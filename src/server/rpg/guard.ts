import "server-only";
import { isRpgEnabled, isRpgExpeditionsEnabled, isRpgRefugeEnabled, isRpgExplorationEnabled, isRpgQuestsEnabled, isRpgSharedWorldEnabled } from "../env";
import { UserError } from "../security";
import { isRpgCraftingEnabled } from "../env";

export function requireRpgCraftingEnabled() {
  if (!isRpgCraftingEnabled()) throw new UserError("Forja e comércio indisponíveis.");
}

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

export function requireRpgQuestsEnabled() {
  if (!isRpgQuestsEnabled()) throw new UserError("Missões RPG indisponíveis.");
}

export function requireRpgSharedWorldEnabled() {
  if (!isRpgSharedWorldEnabled()) throw new UserError("Mundo compartilhado indisponível.");
}
