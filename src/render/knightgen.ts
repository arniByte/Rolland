import { registerArt } from "./art";
import { canvasToAscii } from "./raster";
import { setKnightSize } from "./sprites";

// A procedurally-drawn galloping warhorse + armored knight, painted as a LIT
// greyscale illustration (bright = lit surface) on a transparent field, then
// converted to a luminance-ramp ASCII sprite. The lit shading gives the form
// real volume so it reads as a knight, not a blob. Self-contained — no assets.
// The sprite adapts to the viewport so the lane can be long on phones.

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

// lit greyscale tones (brighter = more lit → denser/brighter phosphor glyph)
const HI = "#f2f2f2";
const LT = "#c8c8c8";
const MD = "#8e8e8e";
const SH = "#525252";
const STEEL = "#ffffff"; // armour highlight
const DARKSLIT = "#1c1c1c";

function vgrad(ctx: CanvasRenderingContext2D, yTop: number, yBot: number, top: string, bot: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, yTop * SY, 0, yBot * SY);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  return g;
}

function ell(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, top: string, bot: string): void {
  ctx.fillStyle = vgrad(ctx, y - ry, y + ry, top, bot);
  ctx.beginPath();
  ctx.ellipse(x * SX, y * SY, rx * SX, ry * SY, 0, 0, Math.PI * 2);
  ctx.fill();
}

function pgon(ctx: CanvasRenderingContext2D, pts: [number, number][], top: string, bot: string): void {
  let mn = 1e9;
  let mx = -1e9;
  for (const p of pts) {
    mn = Math.min(mn, p[1]);
    mx = Math.max(mx, p[1]);
  }
  ctx.fillStyle = vgrad(ctx, mn, mx, top, bot);
  ctx.beginPath();
  ctx.moveTo(pts[0]![0] * SX, pts[0]![1] * SY);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0] * SX, pts[i]![1] * SY);
  ctx.closePath();
  ctx.fill();
}

/** A jointed limb: each segment its own width + tone (upper thick/bright → lower thin/dim). */
function limb(ctx: CanvasRenderingContext2D, joints: [number, number][], widths: number[], tones: string[]): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < joints.length - 1; i++) {
    ctx.strokeStyle = tones[Math.min(i, tones.length - 1)] as string;
    ctx.lineWidth = (widths[Math.min(i, widths.length - 1)] as number) * SX;
    ctx.beginPath();
    ctx.moveTo(joints[i]![0] * SX, joints[i]![1] * SY);
    ctx.lineTo(joints[i + 1]![0] * SX, joints[i + 1]![1] * SY);
    ctx.stroke();
  }
}

function drawHorse(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const rear = frame === "rear";
  const ground = 212;
  const lift = rear ? -24 : 0;

  // --- legs first (behind the body). Bright enough to read on the void,
  //     thin + clearly spread so the gallop gaps show. ---
  if (rear) {
    limb(ctx, [[80, 150], [72, 184], [70, ground]], [10, 6], [HI, LT]); // hind stand
    limb(ctx, [[100, 152], [98, 186], [100, ground]], [10, 6], [LT, MD]);
  } else if (frame === "g1") {
    limb(ctx, [[74, 164], [50, 190], [34, ground]], [10, 6], [HI, LT]); // hind, reaching back
    limb(ctx, [[98, 166], [86, 192], [84, ground]], [10, 6], [LT, MD]);
  } else {
    limb(ctx, [[78, 166], [70, 192], [62, ground]], [10, 6], [HI, LT]);
    limb(ctx, [[100, 166], [102, 192], [104, ground]], [10, 6], [LT, MD]); // gathered
  }

  // --- tail (flowing back-down from the croup) ---
  pgon(ctx, [
    [54, 132 + lift], [36, 140 + lift], [20, 172 + lift], [14, 200 + lift],
    [26, 200 + lift], [36, 172 + lift], [50, 148 + lift], [60, 138 + lift],
  ], LT, SH);

  // --- horse body: a long lit back from croup to chest (narrow belly so legs read) ---
  ell(ctx, 78, 148 + lift, 32, 25, LT, SH); // hindquarter (rump)
  ell(ctx, 120, 150 + lift, 50, 17, HI, MD); // barrel — flatter, horse-like back
  ell(ctx, 162, 152 + lift, 26, 21, LT, MD); // chest / shoulder

  // --- neck: a bold lit arch sweeping up to the head ---
  pgon(ctx, [
    [150, 140 + lift], [168, 112 + lift], [192, 90 + lift], [210, 84 + lift],
    [214, 96 + lift], [196, 110 + lift], [178, 132 + lift], [160, 152 + lift],
  ], HI, MD);
  // mane along the crest (bright edge)
  pgon(ctx, [
    [154, 136 + lift], [174, 110 + lift], [200, 86 + lift], [208, 88 + lift],
    [186, 110 + lift], [166, 138 + lift],
  ], STEEL, LT);

  // --- head (pointing up-right) + muzzle + ears + forelock ---
  pgon(ctx, [
    [202, 90 + lift], [212, 76 + lift], [234, 58 + lift], [244, 66 + lift],
    [232, 84 + lift], [216, 102 + lift],
  ], LT, MD);
  pgon(ctx, [[234, 58 + lift], [246, 62 + lift], [238, 74 + lift]], MD, SH); // muzzle
  pgon(ctx, [[206, 80 + lift], [212, 62 + lift], [218, 80 + lift]], LT, SH); // ear
  pgon(ctx, [[216, 78 + lift], [223, 60 + lift], [228, 78 + lift]], HI, SH); // ear
  ell(ctx, 222, 82 + lift, 2.6, 2.6, DARKSLIT, DARKSLIT); // eye

  // --- caparison: a SHORT scalloped skirt so the legs read below it ---
  pgon(ctx, [
    [64, 158 + lift], [170, 158 + lift], [166, 176 + lift], [152, 166 + lift],
    [138, 178 + lift], [122, 166 + lift], [106, 178 + lift], [90, 166 + lift], [76, 176 + lift], [64, 170 + lift],
  ], LT, SH);

  // --- forelegs (in front of the cloth) ---
  if (rear) {
    limb(ctx, [[158, 150 + lift], [184, 132 + lift], [206, 124 + lift]], [9, 6], [HI, LT]); // pawing high
    limb(ctx, [[166, 158 + lift], [196, 146 + lift], [220, 142 + lift]], [9, 6], [LT, MD]);
  } else if (frame === "g1") {
    limb(ctx, [[160, 166], [190, 188], [212, ground]], [10, 6], [STEEL, LT]); // lead, extended
    limb(ctx, [[148, 168], [146, 192], [150, ground]], [10, 6], [HI, MD]); // trailing
  } else {
    limb(ctx, [[160, 168], [172, 190], [182, ground]], [10, 6], [STEEL, LT]);
    limb(ctx, [[150, 168], [146, 192], [144, ground]], [10, 6], [HI, MD]);
  }
}

function drawRider(ctx: CanvasRenderingContext2D, frame: Frame): void {
  const lift = frame === "rear" ? -24 : 0;
  const baseY = 138 + lift; // seat, on the horse's back

  // near leg / greave down the horse's flank
  limb(ctx, [[114, baseY - 2], [120, baseY + 22], [126, baseY + 40]], [10, 6], [LT, MD]);

  // heater shield on the near side (drawn first, behind the torso)
  pgon(ctx, [
    [98, baseY - 30], [120, baseY - 30], [120, baseY - 2], [109, baseY + 12], [98, baseY - 2],
  ], MD, SH);
  pgon(ctx, [[100, baseY - 28], [118, baseY - 10], [113, baseY - 3], [98, baseY - 21]], STEEL, LT); // heraldic bend

  // torso (cuirass), tall + bright, leaning into the charge
  pgon(ctx, [
    [110, baseY], [122, baseY - 44], [134, baseY - 42], [130, baseY - 6], [122, baseY + 2],
  ], STEEL, MD);

  // pauldron (shoulder)
  ell(ctx, 130, baseY - 40, 9, 8, STEEL, LT);

  // near arm reaching forward to couch the lance (lance drawn by arena)
  limb(ctx, [[130, baseY - 36], [146, baseY - 26], [160, baseY - 18]], [8, 6], [LT, SH]);

  // great helm — bright steel bucket
  pgon(ctx, [
    [120, baseY - 66], [138, baseY - 66], [140, baseY - 48], [134, baseY - 42], [122, baseY - 42], [118, baseY - 48],
  ], STEEL, LT);
  ctx.fillStyle = DARKSLIT; // vision slit
  ctx.fillRect(120 * SX, (baseY - 56) * SY, 20 * SX, 2.4 * SY);

  // plume — a big lit crest sweeping back over the helm
  pgon(ctx, [
    [128, baseY - 66], [118, baseY - 88], [96, baseY - 96], [104, baseY - 80], [118, baseY - 66],
  ], HI, MD);
}

function draw(ctx: CanvasRenderingContext2D, frame: Frame): void {
  ctx.clearRect(0, 0, W, H);
  drawHorse(ctx, frame);
  drawRider(ctx, frame);
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
    // luminance source (lit shapes) + ramp halftone = a finely-shaded, readable
    // knight rather than a flat silhouette blob.
    const art = canvasToAscii(ctx, {
      cols,
      rows,
      floor: 0.12,
      dither: 0.22,
      mode: "ramp",
      source: "luma",
    });
    registerArt(`knight_${frame}`, art);
  }
}
