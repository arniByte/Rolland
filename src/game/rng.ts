// Tiny deterministic PRNG (Mulberry32). Seeded so matches are reproducible
// (handy for tests today and lockstep netcode tomorrow).
export class Rng {
  private s: number;

  constructor(seed: number = 0x9e3779b9) {
    this.s = seed >>> 0;
  }

  /** float in [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** integer in [min, max] inclusive (tolerates swapped bounds) */
  int(min: number, max: number): number {
    if (min > max) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)] as T;
  }

  /** Fisher–Yates, returns a new shuffled array */
  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }
}

export function randomSeed(): number {
  // Non-deterministic seed for real play (avoids Date.now in game logic).
  return (Math.floor(Math.random() * 0xffffffff) ^ (performance.now() * 1000)) >>> 0;
}
