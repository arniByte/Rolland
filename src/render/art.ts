// Registry of baked dithered-ASCII art produced offline by scripts/gen-ascii.mjs.
// Each JSON is { w, h, rows: string[], shades: number[][] } where `shades` holds
// a 0..7 blue-ramp index per cell. If no art is baked yet, getArt returns null
// and the renderer falls back to the hand-authored sprites.

export interface AsciiArt {
  w: number;
  h: number;
  rows: string[];
  shades: number[][];
}

const registry: Record<string, AsciiArt> = {};

export function registerArt(key: string, art: AsciiArt): void {
  registry[key] = art;
}

export function getArt(key: string): AsciiArt | null {
  return registry[key] ?? null;
}

// Eagerly pull in any baked art at build time (Vite glob; empty if none yet).
const modules = import.meta.glob<{ default: AsciiArt } | AsciiArt>("../assets/art/*.json", {
  eager: true,
});
for (const path in modules) {
  const file = path.split("/").pop();
  if (!file) continue;
  const key = file.replace(/\.json$/, "");
  const mod = modules[path] as { default?: AsciiArt } & AsciiArt;
  registry[key] = (mod.default ?? mod) as AsciiArt;
}
