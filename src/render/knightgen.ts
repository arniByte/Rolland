import { registerArt } from "./art";
import { canvasToAscii } from "./raster";
import { setKnightSize } from "./sprites";

// Procedurally draw a right-facing knight-on-horse as a smooth silhouette, then
// convert it to a clean dithered-block ASCII sprite. Self-contained — no assets.
// The sprite size adapts to the viewport so the lane can be long on phones.

type Frame = "g1" | "g2" | "rear";

const CELL_PX_W = 8;
const CELL_PX_H = 13; // taller cells mirror the on-screen monospace cell ratio
// shapes are authored in a fixed design space, then scaled to fit W x H.
const DW = 256;
const DH = 234;
let W = 208;
let H = 195;
let SX = W / DW;
let SY = H / DH;

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x * SX, y * SY, rx * SX, ry * SY, 0, 0, Math.PI * 2);
  ctx.fill();
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0] * SX, pts[0]![1] * SY);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0] * SX, pts[i]![1] * SY);
  ctx.closePath();
  ctx.fill();
}

function leg(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, len: number, w = 11): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = w * SX;
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  ctx.moveTo(x * SX, y * SY);
  ctx.lineTo((x + dx * 0.5) * SX, (y + len * 0.5) * SY);
  ctx.lineTo((x + dx) * SX, (y + len) * SY);
  ctx.stroke();
  ctx.restore();
}

function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  ctx.clearRect(0, 0, W, H);
  // rounded volume via a vertical gradient (lighter on top -> darker below)
  const g = ctx.createLinearGradient(0, 30, 0, H);
  g.addColorStop(0, "#5377c4");
  g.addColorStop(0.45, "#2a4799");
  g.addColorStop(1, "#0a1230");
  ctx.fillStyle = g;

  const rear = frame === "rear";
  const groundY = DH - 18; // design space
  const bodyY = rear ? 130 : 142;

  // --- legs first (behind the body) ---
  if (rear) {
    leg(ctx, 96, 178, -30, groundY - 178);
    leg(ctx, 118, 182, -22, groundY - 182);
    leg(ctx, 150, 150, 40, 34); // forelegs raised
    leg(ctx, 168, 140, 50, 30);
  } else if (frame === "g1") {
    leg(ctx, 86, 166, -26, groundY - 166); // hind, reaching back
    leg(ctx, 104, 170, -12, groundY - 170);
    leg(ctx, 168, 166, 22, groundY - 166); // fore, reaching forward
    leg(ctx, 186, 168, 34, groundY - 168);
  } else {
    leg(ctx, 92, 168, 10, groundY - 168); // gathered
    leg(ctx, 110, 170, 20, groundY - 170);
    leg(ctx, 176, 168, -8, groundY - 168);
    leg(ctx, 196, 170, 4, groundY - 170);
  }

  // --- tail ---
  poly(ctx, [
    [60, 116],
    [26, 124],
    [8, 168],
    [24, 174],
    [40, 140],
    [64, 132],
  ]);

  const lift = rear ? -14 : 0;

  // --- horse body ---
  ellipse(ctx, 124, bodyY, 74, 34);
  ellipse(ctx, 78, bodyY - 4, 42, 38); // hindquarter
  ellipse(ctx, 178, bodyY, 36, 30); // shoulder/chest

  // --- neck + head (up to the right) ---
  poly(ctx, [
    [160, bodyY - 20 + lift],
    [196, bodyY - 50 + lift],
    [224, bodyY - 70 + lift],
    [238, bodyY - 54 + lift],
    [208, bodyY - 22 + lift],
    [174, bodyY + 2 + lift],
  ]);
  ellipse(ctx, 234, bodyY - 64 + lift, 18, 13); // head
  poly(ctx, [
    [246, bodyY - 72 + lift],
    [260, bodyY - 58 + lift],
    [248, bodyY - 50 + lift],
  ]); // muzzle
  poly(ctx, [
    [224, bodyY - 78 + lift],
    [232, bodyY - 92 + lift],
    [238, bodyY - 72 + lift],
  ]); // ear

  // --- caparison (draped cloth with a scalloped hem) ---
  poly(ctx, [
    [80, bodyY + 14],
    [172, bodyY + 14],
    [166, bodyY + 58],
    [150, bodyY + 40],
    [132, bodyY + 60],
    [112, bodyY + 40],
    [92, bodyY + 60],
    [78, bodyY + 40],
  ]);

  // --- rider ---
  const rx = 128;
  const ry = bodyY - 50 + lift;
  ellipse(ctx, rx, ry, 18, 26); // torso
  ellipse(ctx, rx, ry - 30, 14, 15); // helm
  poly(ctx, [
    [rx - 20, ry + 4],
    [rx - 8, ry - 6],
    [rx - 2, ry + 26],
    [rx - 16, ry + 30],
  ]); // shield
  // plume sweeping back
  poly(ctx, [
    [rx - 2, ry - 44],
    [rx + 16, ry - 58],
    [rx + 12, ry - 40],
    [rx + 2, ry - 36],
  ]);
}

let lastSize = "";

/** (Re)build the knight sprites at a given cell size. Cheap; called on resize. */
export function buildKnights(cols: number, rows: number): void {
  const key = `${cols}x${rows}`;
  if (key === lastSize) return;
  lastSize = key;

  setKnightSize(cols, rows);
  W = cols * CELL_PX_W;
  H = rows * CELL_PX_H;
  SX = W / DW;
  SY = H / DH;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const frame of ["g1", "g2", "rear"] as Frame[]) {
    draw(ctx, frame);
    // "ramp" (punctuation halftone) gives continuous luminance shading — the
    // DARK PHOSPHOR fidelity jump — instead of flat ░▒▓█ blocks.
    const art = canvasToAscii(ctx, {
      cols,
      rows,
      floor: 0.12,
      dither: 0.5,
      mode: "ramp",
    });
    registerArt(`knight_${frame}`, art);
  }
}
