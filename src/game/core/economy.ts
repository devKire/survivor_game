/** Shared, pure economic rules. No exchange endpoint exists. XP is unrelated. */
export const ECONOMY_VERSION = 2;
export const MAX_BALANCE = 1_000_000_000;
export type Currency = "GEMS" | "GOLD";
export function validAmount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_BALANCE)
    throw new Error("Valor econômico inválido.");
  return value;
}
export function balanceAfter(balance: number, delta: number) {
  validAmount(balance);
  if (!Number.isSafeInteger(delta)) throw new Error("Transação inválida.");
  return validAmount(balance + delta);
}
export function achievementCurrency(id: string): Currency {
  return ["complete", "gardens", "austere", "third_phase"].includes(id)
    ? "GOLD"
    : "GEMS";
}
export function achievementAmount(id: string, legacyReward = 0) {
  return achievementCurrency(id) === "GOLD"
    ? Math.ceil(legacyReward / 10)
    : legacyReward;
}
export function completionGold(completed: boolean, duration: number) {
  return completed ? ({ 600: 2, 900: 3, 1800: 6 }[duration] ?? 0) : 0;
}
export function pveGems(
  collected: number,
  completed: boolean,
  multiplier: number,
  base: number,
) {
  validAmount(collected);
  return validAmount(
    Math.floor(collected * (completed ? multiplier : 1)) +
      (completed ? base : 0),
  );
}
