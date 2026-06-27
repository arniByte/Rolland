// Trauma-based screen shake. Add trauma on hits; shake = trauma^2 so small
// knocks barely move and big clashes really rattle. Decays over time.
export class Shake {
  private trauma = 0;
  private t = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dtMs: number): void {
    this.t += dtMs;
    this.trauma = Math.max(0, this.trauma - (dtMs / 1000) * 1.6);
  }

  /** current pixel offset + rotation to apply before drawing the scene */
  offset(maxPx: number): { x: number; y: number; rot: number } {
    const s = this.trauma * this.trauma;
    if (s <= 0) return { x: 0, y: 0, rot: 0 };
    const f = this.t * 0.05;
    return {
      x: maxPx * s * noise(f, 1.3),
      y: maxPx * s * noise(f, 5.7),
      rot: 0.04 * s * noise(f, 9.1),
    };
  }

  get value(): number {
    return this.trauma;
  }
}

// cheap smooth pseudo-noise in [-1,1]
function noise(t: number, seed: number): number {
  return Math.sin(t * 12.9898 + seed) * Math.cos(t * 7.233 + seed * 1.7);
}
