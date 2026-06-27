// Low-level ASCII canvas. Everything is a glyph placed on a character grid.
// We keep float positions in game logic but always snap to integer device
// pixels at draw time so the monospace text stays razor-sharp.

export const FONT_STACK =
  "'JetBrains Mono', ui-monospace, 'SFMono-Regular', 'Menlo', 'Consolas', monospace";

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  cssW = 0;
  cssH = 0;
  cellW = 10;
  cellH = 16;
  cols = 40;
  rows = 30;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas not supported");
    this.ctx = ctx;
  }

  /** Resize to the element's box and recompute the character grid. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, Math.round(rect.width));
    this.cssH = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);

    // ~40 cells across the *shorter* axis keeps glyphs a consistent size on any device.
    const base = Math.min(this.cssW, this.cssH) / 40;
    this.cellH = Math.max(8, Math.round(base * 1.05));
    this.cellW = Math.max(5, Math.round(this.cellH * 0.6));
    this.cols = Math.floor(this.cssW / this.cellW);
    this.rows = Math.floor(this.cssH / this.cellH);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `${this.cellH}px ${FONT_STACK}`;
  }

  get cx0(): number {
    return Math.floor((this.cols - this.usableCols) / 2);
  }
  get usableCols(): number {
    return this.cols;
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.cssW, this.cssH);
  }

  /** Fill a rectangular region given in *cell* coordinates with a solid colour. */
  fillCells(col: number, row: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      Math.round(col * this.cellW),
      Math.round(row * this.cellH),
      Math.round(w * this.cellW),
      Math.round(h * this.cellH),
    );
  }

  /** Draw one glyph at a (possibly fractional) cell position. */
  glyph(col: number, row: number, ch: string, color: string, alpha = 1): void {
    if (ch === " " || ch === "") return;
    const ctx = this.ctx;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillText(ch, Math.round(col * this.cellW), Math.round(row * this.cellH));
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /** Draw a string left-to-right, one glyph per cell (keeps grid alignment). */
  text(col: number, row: number, str: string, color: string, alpha = 1): void {
    const ctx = this.ctx;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const y = Math.round(row * this.cellH);
    for (let i = 0; i < str.length; i++) {
      const ch = str[i] as string;
      if (ch !== " ") ctx.fillText(ch, Math.round((col + i) * this.cellW), y);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /** Centred string. */
  textCenter(row: number, str: string, color: string, alpha = 1): void {
    const col = (this.cols - str.length) / 2;
    this.text(col, row, str, color, alpha);
  }

  /** Draw a sprite (array of rows). Spaces are transparent. */
  sprite(
    col: number,
    row: number,
    rowsArr: readonly string[],
    color: string,
    alpha = 1,
    mirror = false,
  ): void {
    for (let r = 0; r < rowsArr.length; r++) {
      const line = rowsArr[r] as string;
      const len = line.length;
      for (let i = 0; i < len; i++) {
        const ch = line[mirror ? len - 1 - i : i] as string;
        if (ch === " ") continue;
        this.glyph(col + i, row + r, mirror ? MIRROR[ch] ?? ch : ch, color, alpha);
      }
    }
  }

  /** A monospace string drawn with a custom per-glyph colour callback. */
  textShaded(
    col: number,
    row: number,
    str: string,
    colorAt: (i: number, ch: string) => string,
    alpha = 1,
  ): void {
    const ctx = this.ctx;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    const y = Math.round(row * this.cellH);
    for (let i = 0; i < str.length; i++) {
      const ch = str[i] as string;
      if (ch === " ") continue;
      ctx.fillStyle = colorAt(i, ch);
      ctx.fillText(ch, Math.round((col + i) * this.cellW), y);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }
}

// Glyphs that need flipping when a sprite is mirrored.
const MIRROR: Record<string, string> = {
  "/": "\\",
  "\\": "/",
  "(": ")",
  ")": "(",
  "<": ">",
  ">": "<",
  "[": "]",
  "]": "[",
  "{": "}",
  "}": "{",
  "d": "b",
  "b": "d",
  "`": "'",
  "'": "`",
  "⌐": "¬",
};
