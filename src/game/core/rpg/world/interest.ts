import type { Vec } from "../../types";
import { WORLD_AOI_CELL, WORLD_AOI_RADIUS } from "./types";

/** Incremental spatial index. Snapshots visit intersecting cells, not every player. */
export class WorldInterest<T extends Vec & { id: string }> {
  private cells = new Map<string, Map<string, T>>();
  private locations = new Map<string, string>();
  constructor(readonly cellSize = WORLD_AOI_CELL) {
    if (!Number.isFinite(cellSize) || cellSize <= 0)
      throw new Error("Invalid AOI cell");
  }
  private key(p: Vec) {
    return `${Math.floor(p.x / this.cellSize)}:${Math.floor(p.y / this.cellSize)}`;
  }
  upsert(value: T) {
    const key = this.key(value),
      old = this.locations.get(value.id);
    if (old && old !== key) this.remove(value.id);
    let cell = this.cells.get(key);
    if (!cell) this.cells.set(key, (cell = new Map()));
    cell.set(value.id, value);
    this.locations.set(value.id, key);
  }
  remove(id: string) {
    const key = this.locations.get(id);
    if (key === undefined) return;
    const cell = this.cells.get(key)!;
    cell.delete(id);
    if (!cell.size) this.cells.delete(key);
    this.locations.delete(id);
  }
  query(point: Vec, radius = WORLD_AOI_RADIUS): T[] {
    if (!Number.isFinite(radius) || radius < 0 || radius > 4096)
      throw new Error("Invalid AOI radius");
    const result: T[] = [];
    for (
      let x = Math.floor((point.x - radius) / this.cellSize);
      x <= Math.floor((point.x + radius) / this.cellSize);
      x++
    )
      for (
        let y = Math.floor((point.y - radius) / this.cellSize);
        y <= Math.floor((point.y + radius) / this.cellSize);
        y++
      )
        for (const p of this.cells.get(`${x}:${y}`)?.values() ?? [])
          if ((p.x - point.x) ** 2 + (p.y - point.y) ** 2 <= radius ** 2)
            result.push(p);
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }
  get size() {
    return this.locations.size;
  }
  get cellCount() {
    return this.cells.size;
  }
  clear() {
    this.cells.clear();
    this.locations.clear();
  }
}
