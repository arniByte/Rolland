// Offline image -> dithered ASCII baker.
//
//   npm run gen:art
//
// 1) Renders the built-in heraldic emblem (an SVG) to ASCII.
// 2) Converts every image in raw-art/ (png/jpg/webp) to ASCII.
//
// Output: src/assets/art/<name>.json = { w, h, rows[], shades[][] }, picked up
// automatically by the game via src/render/art.ts. Drop your own reference
// pictures (knights, manuscripts...) into raw-art/ and re-run to bake them.
import sharp from "sharp";
import { readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename, extname } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "raw-art");
const OUT = join(ROOT, "src/assets/art");

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const TONE = " .:-=+*#%@";
const BLOCKS = " ░▒▓█";

function edgeGlyph(gx, gy) {
  let a = Math.atan2(gy, gx);
  if (a < 0) a += Math.PI;
  const d = (a * 180) / Math.PI;
  if (d < 22.5 || d >= 157.5) return "_";
  if (d < 67.5) return "/";
  if (d < 112.5) return "|";
  return "\\";
}

async function imageToAscii(input, opts = {}) {
  const meta = await sharp(input).metadata();
  const cols = opts.cols ?? 96;
  const rows = opts.rows ?? Math.max(6, Math.round(cols * (meta.height / meta.width) * 0.5));
  const floor = opts.floor ?? 0.14;
  const dither = opts.dither ?? 0.6;
  const ramp = opts.mode === "block" ? BLOCKS : TONE;
  const L = ramp.length;

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pxW = info.width;
  const pxH = info.height;
  const cw = pxW / cols;
  const ch = pxH / rows;

  const ink = [];
  for (let r = 0; r < rows; r++) {
    ink[r] = [];
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(r * ch); y < Math.floor((r + 1) * ch); y++) {
        for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x++) {
          const i = (y * pxW + x) * 4;
          const a = data[i + 3] / 255;
          const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
          sum += a * (1 - lum);
          n++;
        }
      }
      ink[r][c] = n ? sum / n : 0;
    }
  }

  const outRows = [];
  const shades = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    shades[r] = [];
    for (let c = 0; c < cols; c++) {
      const v0 = ink[r][c];
      if (opts.edges) {
        const at = (rr, cc) => (ink[rr] && ink[rr][cc] !== undefined ? ink[rr][cc] : v0);
        const gx = at(r, c + 1) - at(r, c - 1) + at(r - 1, c + 1) - at(r - 1, c - 1) + at(r + 1, c + 1) - at(r + 1, c - 1);
        const gy = at(r + 1, c) - at(r - 1, c) + at(r + 1, c + 1) - at(r - 1, c + 1) + at(r + 1, c - 1) - at(r - 1, c - 1);
        if (Math.hypot(gx, gy) > (opts.edgeThreshold ?? 0.55) && v0 > floor * 0.5) {
          line += edgeGlyph(gx, gy);
          shades[r][c] = 7;
          continue;
        }
      }
      if (v0 < 0.03) {
        line += " ";
        shades[r][c] = 0;
        continue;
      }
      const bias = (BAYER4[(r & 3) * 4 + (c & 3)] / 16 - 0.5) * dither;
      const v = Math.max(0, Math.min(1, v0 + bias));
      if (v < floor) {
        line += " ";
        shades[r][c] = 0;
        continue;
      }
      line += ramp[Math.min(L - 1, Math.max(1, Math.round(v * (L - 1))))];
      shades[r][c] = Math.min(7, Math.round(v * 7));
    }
    outRows.push(line.replace(/\s+$/, ""));
  }
  return { w: cols, h: rows, rows: outRows, shades };
}

// Heraldic emblem authored as an SVG (black ink on transparent).
const EMBLEM_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="460" viewBox="0 0 420 460">
  <g fill="#1a1208" stroke="#1a1208" stroke-width="3">
    <!-- crossed lances -->
    <g stroke-width="9" stroke-linecap="round">
      <line x1="70" y1="430" x2="350" y2="120"/>
      <line x1="350" y1="430" x2="70" y2="120"/>
    </g>
    <polygon points="60,116 84,120 70,138"/>
    <polygon points="360,116 336,120 350,138"/>
    <!-- great helm -->
    <path d="M150 70 q60 -40 120 0 l8 70 q-68 26 -136 0 z"/>
    <rect x="186" y="96" width="48" height="10" fill="#f1e9d2"/>
    <rect x="200" y="112" width="20" height="40" fill="#f1e9d2"/>
    <!-- plume -->
    <path d="M210 64 q40 -54 70 -34 q-30 6 -44 44 z"/>
    <!-- shield -->
    <path d="M140 210 h140 v70 q0 90 -70 130 q-70 -40 -70 -130 z"/>
    <path d="M210 214 v186" stroke="#f1e9d2" stroke-width="10"/>
    <path d="M150 250 h120" stroke="#f1e9d2" stroke-width="10"/>
  </g>
</svg>`;

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  // 1) built-in emblem
  const emblem = await imageToAscii(Buffer.from(EMBLEM_SVG), {
    cols: 40,
    mode: "ramp",
    dither: 0.5,
    edges: true,
    edgeThreshold: 0.5,
    floor: 0.12,
  });
  await writeFile(join(OUT, "emblem.json"), JSON.stringify(emblem));
  console.log(`baked emblem.json (${emblem.w}x${emblem.h})`);

  // 2) any user images in raw-art/
  if (!existsSync(RAW)) {
    await mkdir(RAW, { recursive: true });
    console.log("raw-art/ created — drop png/jpg/webp reference images in it and re-run to bake them.");
    return;
  }
  const files = (await readdir(RAW)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  for (const f of files) {
    const name = basename(f, extname(f));
    try {
      const art = await imageToAscii(join(RAW, f), { cols: 110, mode: "ramp", edges: true });
      await writeFile(join(OUT, `${name}.json`), JSON.stringify(art));
      console.log(`baked ${name}.json (${art.w}x${art.h}) from ${f}`);
    } catch (err) {
      console.error(`failed to bake ${f}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!files.length) console.log("raw-art/ has no images — add png/jpg/webp and re-run to bake them.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
