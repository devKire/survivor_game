export const TAU = Math.PI * 2;

export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const choose = <T>(a: readonly T[]): T =>
  a[Math.floor(Math.random() * a.length)];
export const clock = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(t % 60)
    .toString()
    .padStart(2, "0")}`;
export const fmt = (n: number) => Math.floor(n).toLocaleString("pt-BR");
export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const removeAt = <T>(a: T[], i: number) => {
  a[i] = a[a.length - 1];
  a.pop();
};
export { xpNeed } from "./progression";

export function weighted<T>(
  items: T[],
  weight: (x: T) => number = (x) => (x as T & { weight: number }).weight,
): T {
  let n = Math.random() * items.reduce((s, x) => s + Math.max(0, weight(x)), 0);

  for (const x of items) {
    n -= Math.max(0, weight(x));
    if (n < 0) return x;
  }

  return items[items.length - 1];
}

export function hashString(text: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeWorldSeed() {
  const a = (Date.now() >>> 0).toString(16).padStart(8, "0");
  const b = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return (a + b).toUpperCase();
}

/* Colisão varrida: projéteis rápidos não atravessam alvos entre passos. */
export function segmentDistance2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(
    ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1),
    0,
    1,
  );

  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
}
