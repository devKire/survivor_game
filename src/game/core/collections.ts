import type { Enemy } from "./types";
export class Pool<T> {
  free: T[] = [];
  items: T[] = [];
  constructor(
    public factory: () => T,
    public limit: number,
  ) {
    this.factory = factory;
    this.limit = limit;
    this.free = [];
    this.items = [];
  }

  take() {
    if (this.items.length >= this.limit) return null;
    const item = this.free.pop() || this.factory();
    this.items.push(item);
    return item;
  }

  remove(i: number) {
    this.free.push(this.items[i]);
    this.items[i] = this.items[this.items.length - 1];
    this.items.pop();
  }

  clear() {
    while (this.items.length) this.free.push(this.items.pop()!);
  }
}

export class SpatialGrid {
  size: number;
  cells = new Map<string, Enemy[]>();
  spare: Enemy[][] = [];
  constructor(size = 96) {
    this.size = size;
    this.cells = new Map();
    this.spare = [];
  }

  rebuild(enemies: Enemy[]) {
    for (const a of this.cells.values()) {
      a.length = 0;
      this.spare.push(a);
    }

    this.cells.clear();

    for (const e of enemies) {
      if (e.dead) continue;

      const key =
        Math.floor(e.x / this.size) + "," + Math.floor(e.y / this.size);

      let cell = this.cells.get(key);

      if (!cell) {
        cell = this.spare.pop() || [];
        this.cells.set(key, cell);
      }

      cell.push(e);
    }
  }

  query(x: number, y: number, r: number, fn: (e: Enemy) => void) {
    const s = this.size;

    for (let a = Math.floor((x - r) / s); a <= Math.floor((x + r) / s); a++) {
      for (let b = Math.floor((y - r) / s); b <= Math.floor((y + r) / s); b++) {
        const cell = this.cells.get(a + "," + b);

        if (cell) {
          for (let i = 0; i < cell.length; i++) {
            if (!cell[i].dead) fn(cell[i]);
          }
        }
      }
    }
  }

  nearest(
    x: number,
    y: number,
    r: number,
    excluded?: Set<number>,
  ): Enemy | null {
    let best: Enemy | null = null;
    let d = r * r;

    this.query(x, y, r, (e) => {
      if (excluded?.has(e.id)) return;

      const dd = (e.x - x) ** 2 + (e.y - y) ** 2;

      if (dd < d) {
        d = dd;
        best = e;
      }
    });

    return best;
  }
}
