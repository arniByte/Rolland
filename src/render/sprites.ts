// Knight-on-horse metadata + a minimal fallback. The detailed sprite is drawn
// procedurally (knightgen.ts) and converted to dithered-block ASCII at boot;
// these rows only render if that build ever fails. P2 is the mirror of P1.

export interface Sprite {
  rows: readonly string[];
  /** where the couched lance begins (sprite-local cell offset) */
  hand: { col: number; row: number };
  /** hoof cells for dust */
  hooves: ReadonlyArray<{ col: number; row: number }>;
}

export const KNIGHT_W = 26;
export const KNIGHT_H = 15;

// Compact fallback silhouette (used only if procedural art fails to build).
const FALLBACK: readonly string[] = [
  "              ▟█▙               ",
  "             ▐███▌      ▟▀▙      ",
  "            ▟█████▙  ▟▛▀███◣     ",
  "      ▟▀▀▀▀▀██████▀▀▀▀▙          ",
  "     ▐▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▌          ",
  "     ▐▒◆▒▒◆▒▒◆▒▒◆▒▒▒▒▒▌          ",
  "      ▝▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘           ",
  "      ▐▌ ▐▌      ▐▌ ▐▌           ",
  "      ▟▖ ▟▖      ▟▖ ▟▖           ",
];

export const KNIGHT_FRAMES: Record<"g1" | "g2" | "rear", Sprite> = {
  g1: { rows: FALLBACK, hand: { col: 15, row: 6 }, hooves: [{ col: 6, row: 14 }, { col: 21, row: 14 }] },
  g2: { rows: FALLBACK, hand: { col: 15, row: 6 }, hooves: [{ col: 6, row: 14 }, { col: 20, row: 14 }] },
  rear: { rows: FALLBACK, hand: { col: 16, row: 4 }, hooves: [{ col: 10, row: 14 }, { col: 13, row: 14 }] },
};
