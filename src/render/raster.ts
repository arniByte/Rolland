import type { AsciiArt } from "./art";
import { BAYER4 } from "./frame";
import { TONE_RAMP, SHADE_BLOCKS } from "./palette";

export interface RasterOpts {
  cols: number;
  rows: number;
  /** below this coverage a cell is empty */
  floor?: number;
  /** ordered-dither strength */
  dither?: number;
  /** add Sobel structural edge glyphs (Acerola-style) */
  edges?: boolean;
  edgeThreshold?: number;
  /** 'ramp' = punctuation halftone (great for big art); 'block' = ░▒▓█ shaded
   *  silhouette (clean for small sprites) */
  mode?: "ramp" | "block";
}

const EDGE_BY_ANGLE = (gx: number, gy: number): string => {
  let a = Math.atan2(gy, gx); // -PI..PI
  if (a < 0) a += Math.PI; // 0..PI (edge orientation)
  const deg = (a * 180) / Math.PI;
  if (deg < 22.5 || deg >= 157.5) return "_";
  if (deg < 67.5) return "/";
  if (deg < 112.5) return "|";
  return "\\";
};

/**
 * Convert a canvas's pixels into a dithered ASCII sprite.
 * Ink is taken as alpha-weighted darkness, so draw dark shapes on a
 * transparent background. Returns glyphs + a 0..7 blue-ramp shade per cell.
 */
export function canvasToAscii(ctx: CanvasRenderingContext2D, opts: RasterOpts): AsciiArt {
  const { cols, rows } = opts;
  const floor = opts.floor ?? 0.14;
  const ditherAmt = opts.dither ?? 0.7;
  const pxW = ctx.canvas.width;
  const pxH = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, pxW, pxH).data;
  const cw = pxW / cols;
  const ch = pxH / rows;

  // 1) per-cell ink coverage (0 empty .. 1 solid dark)
  const ink: number[][] = [];
  for (let r = 0; r < rows; r++) {
    ink[r] = [];
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let n = 0;
      const x0 = Math.floor(c * cw);
      const x1 = Math.floor((c + 1) * cw);
      const y0 = Math.floor(r * ch);
      const y1 = Math.floor((r + 1) * ch);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * pxW + x) * 4;
          const a = (img[i + 3] as number) / 255;
          const lum =
            ((img[i] as number) * 0.299 +
              (img[i + 1] as number) * 0.587 +
              (img[i + 2] as number) * 0.114) /
            255;
          sum += a * (1 - lum);
          n++;
        }
      }
      ink[r]![c] = n > 0 ? sum / n : 0;
    }
  }

  // 2) glyphs + shades with ordered dither and optional Sobel edges
  const outRows: string[] = [];
  const shades: number[][] = [];
  const block = opts.mode === "block";
  const ramp = block ? SHADE_BLOCKS : TONE_RAMP;
  const L = ramp.length;
  for (let r = 0; r < rows; r++) {
    let line = "";
    shades[r] = [];
    for (let c = 0; c < cols; c++) {
      const v0 = ink[r]![c] as number;

      if (opts.edges) {
        const gx =
          (ink[r]![c + 1] ?? v0) - (ink[r]![c - 1] ?? v0) +
          ((ink[r - 1]?.[c + 1] ?? v0) - (ink[r - 1]?.[c - 1] ?? v0)) +
          ((ink[r + 1]?.[c + 1] ?? v0) - (ink[r + 1]?.[c - 1] ?? v0));
        const gy =
          (ink[r + 1]?.[c] ?? v0) - (ink[r - 1]?.[c] ?? v0) +
          ((ink[r + 1]?.[c + 1] ?? v0) - (ink[r - 1]?.[c + 1] ?? v0)) +
          ((ink[r + 1]?.[c - 1] ?? v0) - (ink[r - 1]?.[c - 1] ?? v0));
        const mag = Math.hypot(gx, gy);
        if (mag > (opts.edgeThreshold ?? 0.55) && v0 > floor * 0.5) {
          line += EDGE_BY_ANGLE(gx, gy);
          shades[r]![c] = 7;
          continue;
        }
      }

      if (v0 < 0.03) {
        // truly empty: never let ordered-dither bias paint a halo
        line += " ";
        shades[r]![c] = 0;
        continue;
      }
      const bias = ((BAYER4[(r & 3) * 4 + (c & 3)] as number) / 16 - 0.5) * ditherAmt;
      const v = Math.max(0, Math.min(1, v0 + bias));
      if (v < floor) {
        line += " ";
        shades[r]![c] = 0;
        continue;
      }
      const gi = Math.min(L - 1, Math.max(1, Math.round(v * (L - 1))));
      line += ramp[gi] as string;
      shades[r]![c] = Math.min(7, Math.round(v * 7));
    }
    outRows.push(line);
  }

  return { w: cols, h: rows, rows: outRows, shades };
}
