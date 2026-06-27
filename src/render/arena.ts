import { Screen } from "./screen";
import { C, ACCENT, blueShade } from "./palette";
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

  // gentle floating motes / drifting embers for life in the air
  private spawnAmbient(dt: number): void {
    this.ambientAccum += dt;
    if (this.ambientAccum < 240) return;
    this.ambientAccum = 0;
    const s = this.s;
    const x = Math.random() * s.cols;
    const y = 2 + Math.random() * (s.rows * 0.55);
    const ember = Math.random() < 0.18;
    this.particles.spawn(x, y, 1, {
      color: ember ? C.red : C.blue4,
      dir: -Math.PI / 2 + (Math.random() - 0.5),
      spread: 0.6,
      speed: 0.012,
      gravity: ember ? -0.0006 : -0.0002,
      life: 3200,
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

    s.clear(C.parchment);
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
    // ambient particles float over the scene on every screen
    if (e.screen === "title") this.particles.draw(s);

    ctx.restore();
    this.drawCRT();
  }

  // ---- layout -----------------------------------------------------------
  private layout(e: GameView): Layout {
    const s = this.s;
    const kw = KNIGHT.w;
    // lift the lane on tall (portrait) screens so the joust sits in the open
    // band between the two answer pads instead of way down low
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
      p0x: Math.round(leftHome + (centerL - leftHome) * p0),
      p1x: Math.round(rightHome + (centerR - rightHome) * p1),
    };
  }

  // ---- background -------------------------------------------------------
  private drawSky(): void {
    const s = this.s;
    const skyH = Math.round(s.rows * 0.5);
    ditherFill(s, 0, 0, s.cols, skyH, 0.05, 0.24, C.blue4);

    // drifting clouds (wrap across the sky)
    const span = s.cols + 16;
    this.cloud(((this.time * 0.0016) % span) - 8, 3, 10);
    this.cloud(((this.time * 0.0011 + span * 0.4) % span) - 8, 6, 14);
    this.cloud(((this.time * 0.0022 + span * 0.7) % span) - 8, 9, 8);

    // a couple of distant birds gliding
    this.bird(((this.time * 0.006) % (s.cols + 10)) - 5, 5);
    this.bird(((this.time * 0.0048 + 30) % (s.cols + 10)) - 5, 8);
  }

  private cloud(col: number, row: number, w: number): void {
    const s = this.s;
    const c = Math.round(col);
    for (let i = 0; i < w; i++) {
      const edge = i === 0 || i === w - 1;
      s.glyph(c + i, row, edge ? "░" : "▒", C.blue4, 0.6);
      if (i > 1 && i < w - 1) s.glyph(c + i, row - 1, "░", C.blue4, 0.45);
    }
  }

  private bird(col: number, row: number): void {
    const c = Math.round(col);
    const flap = Math.floor(this.time * 0.006) % 2 === 0 ? "ᵛ" : "ⱽ";
    this.s.glyph(c, row, flap, C.blue2, 0.5);
  }

  private drawScenery(layout: Layout): void {
    const s = this.s;
    const horizon = layout.laneRow - 1;

    // crenellated curtain wall along the far side of the lists
    const wallRow = horizon - 3;
    for (let i = 1; i < s.cols - 1; i++) {
      s.glyph(i, wallRow + 1, "▒", C.blue3, 0.45);
      s.glyph(i, wallRow + 2, "▒", C.blue2, 0.5);
      s.glyph(i, wallRow, i % 2 === 0 ? "▄" : " ", C.blue3, 0.45);
    }
    // towers with conical roofs
    const cx = Math.floor(s.cols / 2);
    for (const t of [-Math.floor(s.cols * 0.34), -Math.floor(s.cols * 0.12), Math.floor(s.cols * 0.12), Math.floor(s.cols * 0.34)]) {
      const col = cx + t;
      if (col < 2 || col > s.cols - 3) continue;
      s.glyph(col, wallRow - 2, "▲", C.blue2, 0.5);
      s.text(col - 1, wallRow - 1, "▟█▙", C.blue2, 0.5);
      s.text(col - 1, wallRow, "███", C.blue2, 0.55);
    }

    // banner poles with fluttering pennants down the length of the rail
    for (let i = 4; i < s.cols - 4; i += 8) {
      const flutter = Math.floor((this.time * 0.004 + i) % 2) === 0;
      const red = (i / 8) % 3 === 1;
      s.glyph(i, horizon - 1, "╿", C.blue2, 0.5);
      s.glyph(i + 1, horizon - 1, flutter ? "◣" : "◂", red ? C.red : ACCENT[0], 0.65);
    }
  }

  private drawLane(layout: Layout): void {
    const s = this.s;
    const row = layout.laneRow;
    ditherFill(s, 0, row + 1, s.cols, s.rows - row - 1, 0.3, 0.05, C.blue2);
    // the long wooden tilt barrier down the centre of the lists
    for (let i = 0; i < s.cols; i++) s.glyph(i, row, i % 8 === 4 ? "╤" : "═", C.blue1);
    for (let i = 4; i < s.cols; i += 8) s.glyph(i, row + 1, "║", C.blue1, 0.6);
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
    const top = layout.knightTop + Math.round(v.bob);
    const flash = v.flash > 0.5;

    const art = getArt(`knight_${this.frameKey(e, player)}`);
    if (art) {
      drawArtSprite(s, x, top, art, mirror, flash);
    } else {
      s.fillCells(x + 2, top + 2, KNIGHT.w - 4, KNIGHT.h - 3, C.blue1);
    }

    // plume crest in the player's accent colour
    const plumeCol = mirror ? KNIGHT.w - 1 - Math.round(KNIGHT.w * 0.5) : Math.round(KNIGHT.w * 0.5);
    s.glyph(x + plumeCol, top + 1, "❦", ACCENT[player], 0.95);
    s.glyph(x + plumeCol, top, "❜", ACCENT[player], 0.8);

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
    s.glyph(hx, handRow, "◆", accent, 0.95);
    for (let i = 1; i <= len; i++) s.glyph(hx + dir * i, handRow, "━", C.ink);
    s.glyph(hx + dir * (len - 2), handRow - 1, dir > 0 ? "◣" : "◢", accent, 0.9);
    s.glyph(hx + dir * (len - 1), handRow, dir > 0 ? "►" : "◄", C.blue0);
  }

  // ---- HUD --------------------------------------------------------------
  // Name + hearts live in the HTML pad headers (always visible, both
  // orientations). Here we only draw the round pips, placed in the open band
  // above the knights so the answer pads never cover them.
  private drawHud(e: GameView, layout: Layout): void {
    const s = this.s;
    const pips = e.settings.rounds;
    const row = Math.max(0, layout.knightTop - 2);
    const startCol = Math.floor((s.cols - (pips * 2 - 1)) / 2);
    for (let i = 0; i < pips; i++) {
      const res = e.match.results[i];
      let ch = "◇";
      let col: string = C.vellumShade;
      if (res && res.winner !== null) {
        ch = "◆";
        col = ACCENT[res.winner];
      } else if (i === e.match.round && e.screen !== "matchOver") {
        ch = "◈";
        col = C.red;
      }
      s.glyph(startCol + i * 2, row, ch, col);
    }
  }

  // ---- centre banners (clash / result / quick-draw cue) ----------------
  private drawCenter(e: GameView, layout: Layout): void {
    const s = this.s;

    // Quick Draw: HOLD … then a sudden STRIKE cue both players can read at a glance
    if (e.screen === "playing" && e.problem && e.problem.kind === "quickdraw") {
      const reveal = e.problem.revealMs ?? 0;
      const open = e.exchangeAge >= reveal;
      const row = Math.max(2, layout.knightTop - 3);
      if (open) {
        const flick = Math.floor(this.time * 0.03) % 2 === 0;
        const txt = "⚔  STRIKE!  ⚔";
        s.text(Math.floor((s.cols - txt.length) / 2), row, txt, flick ? C.redBright : C.red);
        for (let i = 2; i < s.cols - 2; i++) s.glyph(i, row + 1, "▀", C.red, flick ? 0.5 : 0.3);
      } else {
        const pulse = 0.4 + 0.4 * Math.sin(this.time * 0.012);
        const txt = "◇  hold  ◇";
        s.text(Math.floor((s.cols - txt.length) / 2), row, txt, C.blue2, pulse);
      }
    }

    if (e.screen === "clash" || e.screen === "roundResult") {
      const txt = e.banner;
      const col = Math.floor((s.cols - txt.length) / 2);
      const flicker = e.screen === "clash" && Math.floor(this.time * 0.02) % 2 === 0;
      s.text(col, 4, txt, flicker ? C.redBright : C.red);
      if (e.screen === "roundResult" && e.lastDamage > 0) {
        const dmg = `-${e.lastDamage}`;
        s.text(Math.floor((s.cols - dmg.length) / 2), layout.laneRow - KNIGHT.h - 1, dmg, C.red);
        s.textCenter(s.rows - 2, "tap · or ENTER", C.blue2, 0.8);
      }
    }
  }

  private drawTitleScene(layout: Layout, e: GameView): void {
    const s = this.s;
    const emblem = getArt("emblem");
    if (emblem) {
      const col = Math.floor((s.cols - emblem.w) / 2);
      drawArtSprite(s, col, 1, emblem, false, false);
    }
    this.drawKnight(e, 0, 3, layout);
    this.drawKnight(e, 1, s.cols - 3 - KNIGHT.w, layout);
    divider(s, 6, layout.laneRow + 3, s.cols - 12, C.blue2);
  }

  // ---- events -> particles ---------------------------------------------
  private drainEvents(e: GameView, layout: Layout): void {
    if (e.events.length === 0) return;
    for (const ev of e.events) {
      if (ev.type === "hoof") {
        const x = ev.player === 0 ? layout.p0x + 4 : layout.p1x + KNIGHT.w - 4;
        this.particles.spawn(x, layout.laneRow, 6, {
          color: C.blue3,
          dir: ev.player === 0 ? Math.PI : 0,
          spread: 0.5,
          speed: 0.05,
          gravity: 0.001,
          life: 520,
        });
      } else if (ev.type === "wrong") {
        const x = ev.player === 0 ? layout.p0x + 6 : layout.p1x + KNIGHT.w - 6;
        this.particles.spawn(x, layout.knightTop + 2, 7, {
          color: C.red,
          dir: -Math.PI / 2,
          spread: Math.PI,
          speed: 0.06,
          life: 600,
          glyph: "✘",
        });
      } else if (ev.type === "clash") {
        const cx = Math.floor(this.s.cols / 2);
        this.particles.spawn(cx, layout.laneRow - 2, ev.crit ? 48 : 30, {
          color: C.parchment,
          dir: -Math.PI / 2,
          spread: Math.PI,
          speed: ev.crit ? 0.11 : 0.085,
          gravity: 0.006,
          life: 950,
        });
        this.particles.spawn(cx, layout.laneRow - 2, ev.crit ? 20 : 12, {
          color: C.red,
          spread: Math.PI,
          speed: 0.08,
          life: 750,
          glyph: "✦",
        });
        this.artFlash = 1;
      }
    }
    e.events.length = 0;
  }

  // ---- CRT post ---------------------------------------------------------
  private drawCRT(): void {
    const s = this.s;
    const ctx = s.ctx;
    // scanlines + vignette only when the WebGL post pass isn't doing them
    if (!this.skipCRT) {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = C.ink;
      for (let y = 0; y < s.cssH; y += 3) ctx.fillRect(0, y, s.cssW, 1);
      ctx.globalAlpha = 1;

      const g = ctx.createRadialGradient(
        s.cssW / 2, s.cssH / 2, Math.min(s.cssW, s.cssH) * 0.35,
        s.cssW / 2, s.cssH / 2, Math.max(s.cssW, s.cssH) * 0.7,
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(11,26,74,0.34)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s.cssW, s.cssH);
    }

    if (this.artFlash > 0.01) {
      ctx.globalAlpha = this.artFlash * 0.5;
      ctx.fillStyle = C.parchment;
      ctx.fillRect(0, 0, s.cssW, s.cssH);
      ctx.globalAlpha = 1;
    }
  }
}

// Draw a baked dithered-ASCII sprite at a cell position.
function drawArtSprite(
  s: Screen,
  col: number,
  row: number,
  art: AsciiArt,
  mirror: boolean,
  flash: boolean,
): void {
  for (let r = 0; r < art.rows.length; r++) {
    const line = art.rows[r] as string;
    const shadeRow = art.shades[r] as number[];
    for (let i = 0; i < line.length; i++) {
      const idx = mirror ? line.length - 1 - i : i;
      const ch = line[idx] as string;
      if (ch === " ") continue;
      const t = (shadeRow[idx] ?? 0) / 7;
      s.glyph(col + i, row + r, ch, flash ? C.parchment : blueShade(t));
    }
  }
}
