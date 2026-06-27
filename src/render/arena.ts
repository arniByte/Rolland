import { Screen } from "./screen";
import { C, ACCENT, ACCENT_BRIGHT, familyShade, worldShade } from "./palette";
import { ditherFill, divider } from "./frame";
import { KNIGHT } from "./sprites";
import { Particles } from "./particles";
import { Shake } from "./shake";
import type { GameView } from "../game/view";
import { getArt, type AsciiArt } from "./art";

interface Layout {
  laneRow: number;
  p0x: number;
  p1x: number;
  knightTop: number;
}

type Tint = (t: number) => string;

export class Arena {
  readonly particles = new Particles();
  /** when the WebGL post pass is active it owns scanlines/vignette, so skip ours */
  skipCRT = false;
  private artFlash = 0;
  private ambientAccum = 0;
  private time = 0;

  constructor(
    private s: Screen,
    private shake: Shake,
  ) {}

  update(dt: number): void {
    this.time += dt;
    this.particles.update(dt);
    this.shake.update(dt);
    this.artFlash = Math.max(0, this.artFlash - dt / 200);
    this.spawnAmbient(dt);
  }

  // faint drifting phosphor motes (acid/cyan) + rare warm embers — life in the dark
  private spawnAmbient(dt: number): void {
    this.ambientAccum += dt;
    if (this.ambientAccum < 220) return;
    this.ambientAccum = 0;
    const s = this.s;
    const x = Math.random() * s.cols;
    const y = 2 + Math.random() * (s.rows * 0.6);
    const roll = Math.random();
    const ember = roll < 0.12;
    const cyan = roll > 0.55;
    this.particles.spawn(x, y, 1, {
      color: ember ? C.hit : cyan ? C.cyanDim : C.acidDim,
      dir: -Math.PI / 2 + (Math.random() - 0.5),
      spread: 0.6,
      speed: 0.012,
      gravity: ember ? -0.0006 : -0.00018,
      life: 3400,
      glyph: ember ? "✦" : "·",
    });
  }

  draw(e: GameView): void {
    const s = this.s;
    const layout = this.layout(e);
    this.drainEvents(e, layout);

    const off = this.shake.offset(s.cellW * 1.4);
    const ctx = s.ctx;
    ctx.save();
    ctx.translate(Math.round(off.x), Math.round(off.y));

    s.clear(C.void);
    this.drawSky();
    this.drawScenery(layout);
    this.drawLane(layout);

    if (e.screen === "title") {
      this.drawTitleScene(layout, e);
    } else {
      this.drawKnights(e, layout);
      this.particles.draw(s);
      this.drawHud(e, layout);
      this.drawCenter(e, layout);
    }
    if (e.screen === "title") this.particles.draw(s);

    ctx.restore();
    this.drawCRT();
  }

  // ---- layout -----------------------------------------------------------
  private layout(e: GameView): Layout {
    const s = this.s;
    const kw = KNIGHT.w;
    const portrait = s.cssH > s.cssW;
    const laneRow = Math.round(s.rows * (portrait ? 0.52 : 0.66));
    const leftHome = 2;
    const rightHome = s.cols - 2 - kw;
    const centerL = Math.floor(s.cols / 2) - kw - 1;
    const centerR = Math.floor(s.cols / 2) + 1;
    const p0 = e.knights[0].progress;
    const p1 = e.knights[1].progress;
    return {
      laneRow,
      knightTop: laneRow - KNIGHT.h + 1,
      // fractional (not rounded) → knights slide smoothly between cells
      p0x: leftHome + (centerL - leftHome) * p0,
      p1x: rightHome + (centerR - rightHome) * p1,
    };
  }

  // ---- background -------------------------------------------------------
  private drawSky(): void {
    const s = this.s;
    // a quiet phosphor haze low over the horizon — mostly void above it
    const hazeTop = Math.round(s.rows * 0.34);
    const hazeH = Math.round(s.rows * 0.18);
    ditherFill(s, 0, hazeTop, s.cols, hazeH, 0.0, 0.16, C.cyanDim);

    // distant drifting wisps (very dim, neutral)
    const span = s.cols + 16;
    this.cloud(((this.time * 0.0014) % span) - 8, 4, 12);
    this.cloud(((this.time * 0.001 + span * 0.5) % span) - 8, 7, 16);

    // a couple of far phosphor sparks gliding like night birds
    this.bird(((this.time * 0.006) % (s.cols + 10)) - 5, 5, 0);
    this.bird(((this.time * 0.0047 + 30) % (s.cols + 10)) - 5, 8, 1);
  }

  private cloud(col: number, row: number, w: number): void {
    const s = this.s;
    const c = Math.round(col);
    const col1 = worldShade(0.5);
    const col2 = worldShade(0.34);
    for (let i = 0; i < w; i++) {
      const edge = i === 0 || i === w - 1;
      s.glyph(c + i, row, edge ? "·" : "░", edge ? col2 : col1, 0.5);
      if (i > 1 && i < w - 1 && i % 2 === 0) s.glyph(c + i, row - 1, "·", col2, 0.4);
    }
  }

  private bird(col: number, row: number, player: 0 | 1): void {
    const c = Math.round(col);
    const flap = Math.floor(this.time * 0.006) % 2 === 0 ? "ᵛ" : "ⱽ";
    this.s.glyph(c, row, flap, player === 0 ? C.acidDim : C.cyanDim, 0.7);
  }

  private drawScenery(layout: Layout): void {
    const s = this.s;
    const horizon = layout.laneRow - 1;

    // crenellated curtain wall — neutral, recedes into the dark
    const wallRow = horizon - 3;
    for (let i = 1; i < s.cols - 1; i++) {
      s.glyph(i, wallRow + 1, "▒", worldShade(0.34), 0.5);
      s.glyph(i, wallRow + 2, "▒", worldShade(0.46), 0.55);
      s.glyph(i, wallRow, i % 2 === 0 ? "▄" : " ", worldShade(0.4), 0.5);
    }
    // towers with conical roofs
    const cx = Math.floor(s.cols / 2);
    const towerCol = worldShade(0.5);
    for (const t of [-Math.floor(s.cols * 0.34), -Math.floor(s.cols * 0.12), Math.floor(s.cols * 0.12), Math.floor(s.cols * 0.34)]) {
      const col = cx + t;
      if (col < 2 || col > s.cols - 3) continue;
      s.glyph(col, wallRow - 2, "▲", towerCol, 0.6);
      s.text(col - 1, wallRow - 1, "▟█▙", towerCol, 0.6);
      s.text(col - 1, wallRow, "███", worldShade(0.42), 0.6);
      // a lit phosphor window — alternates the two hues like banners on a keep
      s.glyph(col, wallRow, "▪", (t < 0 ? C.acidDim : C.cyanDim), 0.9);
    }

    // banner poles with fluttering pennants — the colour accents in the gloom
    for (let i = 4; i < s.cols - 4; i += 8) {
      const flutter = Math.floor((this.time * 0.004 + i) % 2) === 0;
      const which = ((i / 8) | 0) % 2 as 0 | 1;
      s.glyph(i, horizon - 1, "╿", worldShade(0.5), 0.6);
      s.glyph(i + 1, horizon - 1, flutter ? "◣" : "◂", ACCENT[which], 0.75);
    }
  }

  private drawLane(layout: Layout): void {
    const s = this.s;
    const row = layout.laneRow;
    // dim ground texture below the rail
    ditherFill(s, 0, row + 1, s.cols, s.rows - row - 1, 0.16, 0.02, worldShade(0.4));
    // the long tilt barrier down the centre of the lists — a faint hairline rail
    for (let i = 0; i < s.cols; i++) s.glyph(i, row, i % 8 === 4 ? "╤" : "═", worldShade(0.7), 0.85);
    for (let i = 4; i < s.cols; i += 8) s.glyph(i, row + 1, "║", worldShade(0.5), 0.5);
  }

  // ---- knights ----------------------------------------------------------
  private frameKey(e: GameView, player: 0 | 1): "g1" | "g2" | "rear" {
    if (e.screen === "matchOver" && e.match.matchWinner === player) return "rear";
    const riding = e.screen === "playing" || e.screen === "clash" || e.screen === "roundIntro";
    if (!riding) return "g1";
    return Math.floor(this.time * 0.012) % 2 === 0 ? "g1" : "g2";
  }

  private drawKnights(e: GameView, layout: Layout): void {
    this.drawKnight(e, 0, layout.p0x, layout);
    this.drawKnight(e, 1, layout.p1x, layout);
  }

  private drawKnight(e: GameView, player: 0 | 1, x: number, layout: Layout): void {
    const s = this.s;
    const v = e.knights[player];
    const mirror = player === 1;
    const top = layout.knightTop + v.bob;
    const flash = v.flash > 0.5;
    const tint: Tint = (t) => familyShade(player, 0.25 + t * 0.75); // keep even thin cells glowing

    const art = getArt(`knight_${this.frameKey(e, player)}`);
    if (art) {
      drawArtSprite(s, x, top, art, mirror, flash, tint);
    } else {
      s.fillCells(Math.round(x) + 2, Math.round(top) + 2, KNIGHT.w - 4, KNIGHT.h - 3, familyShade(player, 0.7));
    }

    // plume crest in the player's bright signal colour
    const plumeCol = mirror ? KNIGHT.w - 1 - Math.round(KNIGHT.w * 0.5) : Math.round(KNIGHT.w * 0.5);
    s.glyph(x + plumeCol, top + 1, "❦", ACCENT_BRIGHT[player], 1);
    s.glyph(x + plumeCol, top, "❜", ACCENT[player], 0.85);

    this.drawLance(player, x, top, v.lance, e);
  }

  private drawLance(player: 0 | 1, x: number, top: number, lance: number, e: GameView): void {
    const s = this.s;
    const accent = ACCENT[player];
    const handRow = top + KNIGHT.handRow;
    const base = lance * 0.4 + (e.screen === "clash" ? 0.65 : 0.45);
    const len = Math.max(8, Math.round(KNIGHT.w * 0.85 * base));
    const dir = player === 0 ? 1 : -1;
    const hx = player === 0 ? x + KNIGHT.handCol : x + (KNIGHT.w - 1 - KNIGHT.handCol);
    s.glyph(hx, handRow, "◆", ACCENT_BRIGHT[player], 1);
    for (let i = 1; i <= len; i++) s.glyph(hx + dir * i, handRow, "━", C.ink, 0.92);
    s.glyph(hx + dir * (len - 2), handRow - 1, dir > 0 ? "◣" : "◢", accent, 0.95);
    s.glyph(hx + dir * (len - 1), handRow, dir > 0 ? "►" : "◄", ACCENT_BRIGHT[player]);
  }

  // ---- HUD --------------------------------------------------------------
  private drawHud(e: GameView, layout: Layout): void {
    const s = this.s;
    const pips = e.settings.rounds;
    const row = Math.max(0, layout.knightTop - 2);
    const startCol = Math.floor((s.cols - (pips * 2 - 1)) / 2);
    for (let i = 0; i < pips; i++) {
      const res = e.match.results[i];
      let ch = "◇";
      let col: string = C.hairline;
      if (res && res.winner !== null) {
        ch = "◆";
        col = ACCENT[res.winner];
      } else if (i === e.match.round && e.screen !== "matchOver") {
        ch = "◈";
        col = C.ink;
      }
      s.glyph(startCol + i * 2, row, ch, col);
    }
  }

  // ---- centre banners (clash / result / quick-draw cue) ----------------
  private drawCenter(e: GameView, layout: Layout): void {
    const s = this.s;

    if (e.screen === "playing" && e.problem && e.problem.kind === "quickdraw") {
      const reveal = e.problem.revealMs ?? 0;
      const open = e.exchangeAge >= reveal;
      const row = Math.max(2, layout.knightTop - 3);
      if (open) {
        const flick = Math.floor(this.time * 0.03) % 2 === 0;
        const txt = "⚔  STRIKE!  ⚔";
        s.text(Math.floor((s.cols - txt.length) / 2), row, txt, flick ? C.hit : C.acidBright);
        for (let i = 2; i < s.cols - 2; i++) s.glyph(i, row + 1, "▀", C.hit, flick ? 0.55 : 0.32);
      } else {
        const pulse = 0.4 + 0.4 * Math.sin(this.time * 0.012);
        const txt = "◇  hold  ◇";
        s.text(Math.floor((s.cols - txt.length) / 2), row, txt, C.inkDim, pulse);
      }
    }

    if (e.screen === "clash" || e.screen === "roundResult") {
      const txt = e.banner;
      const col = Math.floor((s.cols - txt.length) / 2);
      const flicker = e.screen === "clash" && Math.floor(this.time * 0.02) % 2 === 0;
      s.text(col, 4, txt, flicker ? C.hit : C.acidBright);
      if (e.screen === "roundResult" && e.lastDamage > 0) {
        const dmg = `-${e.lastDamage}`;
        s.text(Math.floor((s.cols - dmg.length) / 2), layout.laneRow - KNIGHT.h - 1, dmg, C.hit);
        s.textCenter(s.rows - 2, "tap · or ENTER", C.inkDim, 0.85);
      }
    }
  }

  private drawTitleScene(layout: Layout, e: GameView): void {
    const s = this.s;
    const emblem = getArt("emblem");
    if (emblem) {
      const col = Math.floor((s.cols - emblem.w) / 2);
      drawArtSprite(s, col, 1, emblem, false, false, (t) => familyShade(0, 0.2 + t * 0.8));
    }
    this.drawKnight(e, 0, 3, layout);
    this.drawKnight(e, 1, s.cols - 3 - KNIGHT.w, layout);
    divider(s, 6, layout.laneRow + 3, s.cols - 12, C.inkDim);
  }

  // ---- events -> particles ---------------------------------------------
  private drainEvents(e: GameView, layout: Layout): void {
    if (e.events.length === 0) return;
    for (const ev of e.events) {
      if (ev.type === "hoof") {
        const x = ev.player === 0 ? layout.p0x + 4 : layout.p1x + KNIGHT.w - 4;
        this.particles.spawn(x, layout.laneRow, 6, {
          color: worldShade(0.6),
          dir: ev.player === 0 ? Math.PI : 0,
          spread: 0.5,
          speed: 0.05,
          gravity: 0.001,
          life: 520,
        });
      } else if (ev.type === "wrong") {
        const x = ev.player === 0 ? layout.p0x + 6 : layout.p1x + KNIGHT.w - 6;
        this.particles.spawn(x, layout.knightTop + 2, 7, {
          color: C.hit,
          dir: -Math.PI / 2,
          spread: Math.PI,
          speed: 0.06,
          life: 600,
          glyph: "✘",
        });
      } else if (ev.type === "clash") {
        const cx = Math.floor(this.s.cols / 2);
        this.particles.spawn(cx, layout.laneRow - 2, ev.crit ? 48 : 30, {
          color: C.acidBright,
          dir: -Math.PI / 2,
          spread: Math.PI,
          speed: ev.crit ? 0.11 : 0.085,
          gravity: 0.006,
          life: 950,
          glyph: "✦",
        });
        this.particles.spawn(cx, layout.laneRow - 2, ev.crit ? 22 : 13, {
          color: C.hit,
          spread: Math.PI,
          speed: 0.08,
          life: 760,
          glyph: "✶",
        });
        this.artFlash = 1;
      }
    }
    e.events.length = 0;
  }

  // ---- CRT post (2D fallback only) -------------------------------------
  private drawCRT(): void {
    const s = this.s;
    const ctx = s.ctx;
    if (!this.skipCRT) {
      // dark scanlines over the void
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#000000";
      for (let y = 0; y < s.cssH; y += 3) ctx.fillRect(0, y, s.cssW, 1);
      ctx.globalAlpha = 1;

      const g = ctx.createRadialGradient(
        s.cssW / 2, s.cssH / 2, Math.min(s.cssW, s.cssH) * 0.32,
        s.cssW / 2, s.cssH / 2, Math.max(s.cssW, s.cssH) * 0.72,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.cssW, s.cssH);
    }

    if (this.artFlash > 0.01) {
      ctx.globalAlpha = this.artFlash * 0.32;
      ctx.fillStyle = C.acidBright;
      ctx.fillRect(0, 0, s.cssW, s.cssH);
      ctx.globalAlpha = 1;
    }
  }
}

// Draw a baked dithered-ASCII sprite at a (possibly fractional) cell position,
// colouring each cell by its shade through the supplied tint ramp.
function drawArtSprite(
  s: Screen,
  col: number,
  row: number,
  art: AsciiArt,
  mirror: boolean,
  flash: boolean,
  tint: Tint,
): void {
  for (let r = 0; r < art.rows.length; r++) {
    const line = art.rows[r] as string;
    const shadeRow = art.shades[r] as number[];
    for (let i = 0; i < line.length; i++) {
      const idx = mirror ? line.length - 1 - i : i;
      const ch = line[idx] as string;
      if (ch === " ") continue;
      const t = (shadeRow[idx] ?? 0) / 7;
      s.glyph(col + i, row + r, ch, flash ? C.hit : tint(t));
    }
  }
}
