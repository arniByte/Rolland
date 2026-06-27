// "Roland v2 — DARK PHOSPHOR" palette: finely-shaded ASCII glowing on a
// near-black field, like a CRT terminal in a dark room. Two combatants ARE the
// two reference hues — Roland in acid-lime, Olivier in cyan — over the void,
// with white UI text. This module is the single source of truth for canvas
// colour; `style.css :root` mirrors the same tokens for the HTML overlay.

export const C = {
  // surfaces
  void: "#0A0C10", // arena / page background (near-black, faint blue)
  void2: "#0E1016", // panels, HUD surfaces
  hairline: "#1B2026", // faint borders, scanline base

  // text
  ink: "#EAEAE7", // primary text
  inkDim: "#5B6670", // muted labels, captions

  // ROLAND — acid lime (hero + UI signal)
  acid: "#C3F53C",
  acidDim: "#33420E",
  acidBright: "#EAFFB0",

  // OLIVIER — cyan phosphor (rival)
  cyan: "#3DD6C4",
  cyanDim: "#0E3B3A",
  cyanBright: "#B9FFF7",

  // signal — damage / STRIKE flash, sparing & brief
  hit: "#FF3B30",
} as const;

// ---- colour maths -----------------------------------------------------
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (r << 16) | (g << 8) | b;
  return "#" + c.toString(16).padStart(6, "0");
}

/** Linear blend between two hex colours. */
export function lerpHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(
    Math.round(x[0] + (y[0] - x[0]) * k),
    Math.round(x[1] + (y[1] - x[1]) * k),
    Math.round(x[2] + (y[2] - x[2]) * k),
  );
}

/** Three-stop ramp dim → base → bright, for continuous phosphor shading. */
function ramp3(dim: string, base: string, bright: string, t: number): string {
  const k = clamp01(t);
  return k < 0.5 ? lerpHex(dim, base, k * 2) : lerpHex(base, bright, (k - 0.5) * 2);
}

const ACID_RAMP: readonly [string, string, string] = [C.acidDim, C.acid, C.acidBright];
const CYAN_RAMP: readonly [string, string, string] = [C.cyanDim, C.cyan, C.cyanBright];

// Single-hue mode (config flag): both fighters become a green→white ramp,
// differentiated only by brightness (kept behind one switch per the brief).
let SINGLE_HUE = false;
export function setSingleHue(on: boolean): void {
  SINGLE_HUE = on;
}
export function isSingleHue(): boolean {
  return SINGLE_HUE;
}

/** A player's phosphor colour at luminance `t` (0 dim … 1 bright). */
export function familyShade(player: 0 | 1, t: number): string {
  const fam = SINGLE_HUE || player === 0 ? ACID_RAMP : CYAN_RAMP;
  return ramp3(fam[0], fam[1], fam[2], t);
}

/** The world/atmosphere ramp — low-contrast neutral so the fighters pop. */
export function worldShade(t: number): string {
  // void → faint cyan-grey → dim ink; stays quiet under the combatants
  const k = clamp01(t);
  return k < 0.55 ? lerpHex(C.void, "#21343a", k / 0.55) : lerpHex("#21343a", C.inkDim, (k - 0.55) / 0.45);
}

// Player solid signal colours (accents / borders / particles).
export const ACCENT: readonly [string, string] = [C.acid, C.cyan];
export const ACCENT_BRIGHT: readonly [string, string] = [C.acidBright, C.cyanBright];
export const ACCENT_DIM: readonly [string, string] = [C.acidDim, C.cyanDim];

// ---- glyph ramps ------------------------------------------------------
export const SHADE_BLOCKS = " ░▒▓█"; // 5 levels
export const TONE_RAMP = " .:-=+*#%@"; // 10 levels
// Long luminance ramp (dark → bright) for the fidelity jump: a brighter source
// cell maps to a denser glyph. Monotonic-ish punctuation→glyph coverage.
export const REP_RAMP =
  " .'`^\",:;Il!i~+_-?][}{1)(|/\\tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

export function shadeBlock(t: number): string {
  const i = Math.max(0, Math.min(SHADE_BLOCKS.length - 1, Math.round(t * (SHADE_BLOCKS.length - 1))));
  return SHADE_BLOCKS[i] as string;
}

export function toneChar(t: number): string {
  const i = Math.max(0, Math.min(TONE_RAMP.length - 1, Math.round(t * (TONE_RAMP.length - 1))));
  return TONE_RAMP[i] as string;
}

// Approximate ink coverage of a glyph -> tone (0 light .. 1 dark). Lets us
// author sprites by glyph choice and still get smooth shading for free.
const TONE_BY_GLYPH: Record<string, number> = {
  "█": 0.96, "▓": 0.8, "▒": 0.55, "░": 0.32,
  "▙": 0.9, "▟": 0.9, "▛": 0.9, "▜": 0.9, "▖": 0.7, "▗": 0.7, "▘": 0.7, "▝": 0.7,
  "▀": 0.85, "▄": 0.85, "▌": 0.88, "▐": 0.88, "▏": 0.7, "▕": 0.7, "▔": 0.6, "▁": 0.6,
  "◆": 0.85, "◢": 0.85, "◣": 0.85, "◥": 0.85, "◤": 0.85, "●": 0.9,
};

export function glyphTone(ch: string): number {
  const t = TONE_BY_GLYPH[ch];
  if (t !== undefined) return t;
  if (ch >= "─" && ch <= "╿") return 0.82; // box-drawing reads as an ink outline
  return 0.7;
}
