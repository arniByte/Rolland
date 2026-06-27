// "Roland" palette — a cool blue-on-cream duotone (the dithered ASCII core),
// with gold + vermilion held back as the two illuminated accent pigments
// (used to tell Player 1 from Player 2, and to mark crits / victory).
export const C = {
  parchment: "#F1E9D2",
  parchmentDim: "#E3D7B6",
  vellumShade: "#D6CCA9",

  // blue ramp, dark -> light (the duotone gradient)
  ink: "#0B1A4A",
  blue0: "#120A8F",
  blue1: "#2142AB",
  blue2: "#3A6EA5",
  blue3: "#6E8FBF",
  blue4: "#A9C0DE",

  gold: "#C9A227",
  goldBright: "#F6D12B",
  goldDeep: "#9C7A1E",

  vermilion: "#E34234",
  vermilionDeep: "#B22222",

  ironGall: "#2B2118",
} as const;

// 8-step blue shade ramp from darkest ink to near-parchment, for tonal art.
export const BLUE_RAMP: readonly string[] = [
  C.blue0,
  "#1A2E9B",
  C.blue1,
  "#2E58AD",
  C.blue2,
  "#5480B5",
  C.blue3,
  C.blue4,
];

// Player accent colors.
export const ACCENT: readonly [string, string] = [C.gold, C.vermilion];
export const ACCENT_DEEP: readonly [string, string] = [C.goldDeep, C.vermilionDeep];

// Glyph ramps (dark -> light) used for shading/meters.
export const SHADE_BLOCKS = " ░▒▓█"; // 5 levels
export const TONE_RAMP = " .:-=+*#%@"; // 10 levels, ordered by ink coverage

export function shadeBlock(t: number): string {
  const i = Math.max(0, Math.min(SHADE_BLOCKS.length - 1, Math.round(t * (SHADE_BLOCKS.length - 1))));
  return SHADE_BLOCKS[i] as string;
}

export function toneChar(t: number): string {
  const i = Math.max(0, Math.min(TONE_RAMP.length - 1, Math.round(t * (TONE_RAMP.length - 1))));
  return TONE_RAMP[i] as string;
}

// Approximate ink coverage of a glyph -> tone (0 light .. 1 dark). Lets us
// author sprites by glyph choice and get duotone shading for free.
const TONE_BY_GLYPH: Record<string, number> = {
  "█": 0.96, "▓": 0.8, "▒": 0.55, "░": 0.32,
  "▙": 0.9, "▟": 0.9, "▛": 0.9, "▜": 0.9, "▖": 0.7, "▗": 0.7, "▘": 0.7, "▝": 0.7,
  "▀": 0.85, "▄": 0.85, "▌": 0.88, "▐": 0.88, "▏": 0.7, "▕": 0.7, "▔": 0.6, "▁": 0.6,
  "◆": 0.85, "◢": 0.85, "◣": 0.85, "◥": 0.85, "◤": 0.85, "●": 0.9,
};

export function glyphTone(ch: string): number {
  const t = TONE_BY_GLYPH[ch];
  if (t !== undefined) return t;
  // box-drawing / lines read as ink outlines
  if (ch >= "─" && ch <= "╿") return 0.82;
  return 0.7;
}

/** map a 0..1 intensity to a blue shade */
export function blueShade(t: number): string {
  const i = Math.max(0, Math.min(BLUE_RAMP.length - 1, Math.round(t * (BLUE_RAMP.length - 1))));
  return BLUE_RAMP[i] as string;
}
