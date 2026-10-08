import "server-only";
import { isRpgEnabled } from "../env";
import { UserError } from "../security";

export function requireRpgEnabled() {
  if (!isRpgEnabled()) throw new UserError("RPG indisponível.");
}
