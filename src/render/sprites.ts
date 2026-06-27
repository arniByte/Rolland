// Knight dimensions live here as MUTABLE state so the sprite can scale with the
// viewport (a longer lane on phones needs smaller knights). knightgen.ts draws
// the detailed sprite procedurally into dithered-block ASCII at this size; the
// arena reads these dims for placement, the lance hand, and hooves.

export interface KnightDims {
  w: number;
  h: number;
  handCol: number; // where the couched lance starts (right-facing)
  handRow: number;
  hoofRow: number;
}

export const KNIGHT: KnightDims = {
  w: 26,
  h: 15,
  handCol: 15,
  handRow: 6,
  hoofRow: 14,
};

/** Recompute hand/hoof anchors for a given sprite size. */
export function setKnightSize(w: number, h: number): void {
  KNIGHT.w = w;
  KNIGHT.h = h;
  KNIGHT.handCol = Math.round(w * 0.58);
  KNIGHT.handRow = Math.round(h * 0.42);
  KNIGHT.hoofRow = h - 1;
}
