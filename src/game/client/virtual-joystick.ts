import type { Vec } from "../core/types";

/** Pointer-owned joystick state; one contact can move it, cancellation always releases it. */
export class VirtualJoystick {
  pointerId: number | null = null;
  axis: Vec = { x: 0, y: 0 };

  begin(pointerId: number, x: number, y: number, centerX: number, centerY: number, radius: number) {
    if (this.pointerId !== null) return null;
    this.pointerId = pointerId;
    return this.move(pointerId, x, y, centerX, centerY, radius);
  }

  move(pointerId: number, x: number, y: number, centerX: number, centerY: number, radius: number) {
    if (this.pointerId !== pointerId) return { ...this.axis };
    const dx = (x - centerX) / Math.max(1, radius);
    const dy = (y - centerY) / Math.max(1, radius);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude < 0.12) this.axis = { x: 0, y: 0 };
    else {
      const scale = Math.min(1, magnitude) / magnitude;
      this.axis = { x: dx * scale, y: dy * scale };
    }
    return { ...this.axis };
  }

  release(pointerId: number) {
    if (this.pointerId !== pointerId) return false;
    this.pointerId = null;
    this.axis = { x: 0, y: 0 };
    return true;
  }

  clear() {
    this.pointerId = null;
    this.axis = { x: 0, y: 0 };
  }
}
