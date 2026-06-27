import type { Screen } from "./screen";

interface Particle {
  x: number; // cell coords
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  glyph: string;
  color: string;
  gravity: number;
  alive: boolean;
}

const RAMP = "@%#*+=-:."; // fades from heavy -> faint as life runs out

/** Pre-allocated particle pool — no per-frame allocation, no GC stutter. */
export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor(max = 220) {
    for (let i = 0; i < max; i++) {
      this.pool.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
        glyph: ".", color: "#fff", gravity: 0, alive: false,
      });
    }
  }

  private next(): Particle {
    const p = this.pool[this.cursor] as Particle;
    this.cursor = (this.cursor + 1) % this.pool.length;
    return p;
  }

  spawn(
    x: number,
    y: number,
    count: number,
    opts: {
      color: string;
      speed?: number;
      spread?: number; // radians half-angle
      dir?: number; // base direction radians
      gravity?: number;
      life?: number;
      glyph?: string;
    },
  ): void {
    const speed = opts.speed ?? 0.06;
    const spread = opts.spread ?? Math.PI;
    const dir = opts.dir ?? -Math.PI / 2;
    for (let i = 0; i < count; i++) {
      const p = this.next();
      const a = dir + (Math.random() * 2 - 1) * spread;
      const sp = speed * (0.4 + Math.random() * 0.9);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.gravity = opts.gravity ?? 0.004;
      p.maxLife = (opts.life ?? 700) * (0.6 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.color = opts.color;
      p.glyph = opts.glyph ?? "";
      p.alive = true;
    }
  }

  update(dtMs: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dtMs;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += p.gravity * dtMs;
      p.x += p.vx * dtMs * 0.06;
      p.y += p.vy * dtMs * 0.06;
    }
  }

  draw(s: Screen, ox = 0, oy = 0): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = p.life / p.maxLife; // 1 -> 0
      const glyph = p.glyph || (RAMP[Math.floor((1 - t) * (RAMP.length - 1))] as string);
      s.glyph(p.x + ox, p.y + oy, glyph, p.color, Math.min(1, t * 1.4));
    }
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
  }
}
