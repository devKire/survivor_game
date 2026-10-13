export function freezeNarrative<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeNarrative(child);
    Object.freeze(value);
  }
  return value;
}
