import type { Screen } from "./screen";
import { C, SHADE_BLOCKS } from "./palette";

export interface FrameStyle {
  color: string;
  double?: boolean;
  fleurons?: boolean;
  fill?: string | null;
}

const LINES = {
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
};

/** Draw an illuminated panel border in cell coordinates. */
export function drawFrame(
  s: Screen,
  col: number,
  row: number,
  w: number,
  h: number,
  style: FrameStyle,
): void {
  const L = style.double ? LINES.double : LINES.single;
  const c = style.color;
  if (style.fill) s.fillCells(col, row, w, h, style.fill);

  s.glyph(col, row, L.tl, c);
  s.glyph(col + w - 1, row, L.tr, c);
  s.glyph(col, row + h - 1, L.bl, c);
  s.glyph(col + w - 1, row + h - 1, L.br, c);
  for (let i = 1; i < w - 1; i++) {
    s.glyph(col + i, row, L.h, c);
    s.glyph(col + i, row + h - 1, L.h, c);
  }
  for (let j = 1; j < h - 1; j++) {
    s.glyph(col, row + j, L.v, c);
    s.glyph(col + w - 1, row + j, L.v, c);
  }

  if (style.fleurons) {
    s.glyph(col, row, "❦", c);
    s.glyph(col + w - 1, row, "❦", c);
    s.glyph(col, row + h - 1, "❧", c);
    s.glyph(col + w - 1, row + h - 1, "☙", c);
    if (w >= 9) s.glyph(col + (w >> 1), row, "❧", c);
  }
}

/** A horizontal rule with a centred fleuron, like a manuscript divider. */
export function divider(s: Screen, col: number, row: number, w: number, color: string): void {
  for (let i = 0; i < w; i++) s.glyph(col + i, row, "─", color);
  s.glyph(col + (w >> 1) - 1, row, "•", color);
  s.glyph(col + (w >> 1), row, "❧", color);
  s.glyph(col + (w >> 1) + 1, row, "•", color);
}

/**
 * A block-shaded meter (HP / charge). `t` in 0..1. Fractional cells use
 * partial block glyphs so the bar drains smoothly.
 */
export function meter(
  s: Screen,
  col: number,
  row: number,
  width: number,
  t: number,
  fill: string,
  back: string = C.hairline,
): void {
  const clamped = Math.max(0, Math.min(1, t));
  const exact = clamped * width;
  const full = Math.floor(exact);
  const frac = exact - full;
  const partials = "▏▎▍▌▋▊▉█";
  for (let i = 0; i < width; i++) {
    if (i < full) {
      s.glyph(col + i, row, "█", fill);
    } else if (i === full && frac > 0.08) {
      const pi = Math.min(partials.length - 1, Math.floor(frac * partials.length));
      s.glyph(col + i, row, partials[pi] as string, fill);
    } else {
      s.glyph(col + i, row, "░", back);
    }
  }
}

/** Hearts HP readout. `t` in 0..1 across `count` hearts; last heart can be partial. */
export function hearts(
  s: Screen,
  col: number,
  row: number,
  t: number,
  count: number,
  color: string,
  step = 2,
): void {
  const exact = Math.max(0, Math.min(1, t)) * count;
  for (let i = 0; i < count; i++) {
    const fill = exact - i; // >=1 full · 0..1 partial · <=0 empty
    const c = col + i * step;
    if (fill >= 0.75) s.glyph(c, row, "♥", color);
    else if (fill >= 0.25) s.glyph(c, row, "♥", color, 0.5);
    else s.glyph(c, row, "♥", color, 0.14);
  }
}

/** Vertical dithered gradient fill (parchment sky etc.) using shade blocks. */
export function ditherFill(
  s: Screen,
  col: number,
  row: number,
  w: number,
  h: number,
  topT: number,
  botT: number,
  color: string,
): void {
  for (let j = 0; j < h; j++) {
    const t = topT + ((botT - topT) * j) / Math.max(1, h - 1);
    for (let i = 0; i < w; i++) {
      // 4x4 Bayer ordered dither bias so few glyphs fake many tones
      const bias = (BAYER4[(j & 3) * 4 + (i & 3)] as number) / 16 - 0.5;
      const v = Math.max(0, Math.min(1, t + bias * 0.18));
      const gi = Math.round(v * (SHADE_BLOCKS.length - 1));
      const ch = SHADE_BLOCKS[gi] as string;
      if (ch !== " ") s.glyph(col + i, row + j, ch, color);
    }
  }
}

export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
