import { Screen } from "./screen";
import { C, ACCENT, ACCENT_DEEP, blueShade, glyphTone } from "./palette";
import { drawFrame, meter, ditherFill, divider } from "./frame";
import { KNIGHT_FRAMES, KNIGHT_W, KNIGHT_H, type Sprite } from "./sprites";
import { Particles } from "./particles";
import { Shake } from "./shake";
import { Engine } from "../game/engine";
import { easeInQuad } from "../core/easing";
import { getArt } from "./art";

interface Layout {
  laneRow: number;
  p0x: number;
  p1x: number;
  knightTop: number;
}

export class Arena {
  readonly particles = new Particles();
  private artFlash = 0;

  constructor(
    private s: Screen,
    private shake: Shake,
  ) {}

  update(dt: number): void {
    this.particles.update(dt);
    this.shake.update(dt);
    this.artFlash = Math.max(0, this.artFlash - dt / 200);
  }

  draw(e: Engine): void {
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
      this.drawHud(e);
      this.drawCenter(e, layout);
    }

    ctx.restore();
    this.drawCRT();
  }

  // ---- layout -----------------------------------------------------------
  private layout(e: Engine): Layout {
    const s = this.s;
    const laneRow = Math.round(s.rows * 0.66);
    const leftHome = 3;
    const rightHome = s.cols - 3 - KNIGHT_W;
    const centerL = Math.floor(s.cols / 2) - KNIGHT_W - 1;
    const centerR = Math.floor(s.cols / 2) + 1;
    const p0 = e.knights[0].progress;
    const p1 = e.knights[1].progress;
    return {
      laneRow,
      knightTop: laneRow - KNIGHT_H + 1,
      p0x: Math.round(leftHome + (centerL - leftHome) * p0),
      p1x: Math.round(rightHome + (centerR - rightHome) * p1),
    };
  }

  // ---- background -------------------------------------------------------
  private drawSky(): void {
    const s = this.s;
    const skyH = Math.round(s.rows * 0.5);
    // soft, sparse dither so the sky reads as airy parchment, not noise
    ditherFill(s, 0, 0, s.cols, skyH, 0.06, 0.26, C.blue4);

    // a low sun with a faint halo
    const sunC = Math.round(s.cols * 0.16);
    const sunR = 2;
    for (let dy = -sunR; dy <= sunR; dy++) {
      for (let dx = -sunR; dx <= sunR; dx++) {
        if (dx * dx + dy * dy <= sunR * sunR) s.glyph(sunC + dx, 3 + dy, "▓", C.gold, 0.8);
      }
    }
    for (let a = 0; a < 8; a++) {
      const r = sunR + 2;
      s.glyph(Math.round(sunC + Math.cos((a * Math.PI) / 4) * r), Math.round(3 + Math.sin((a * Math.PI) / 4) * r), "·", C.gold, 0.5);
    }

    // dithered clouds
    this.cloud(Math.round(s.cols * 0.36), 4, 9);
    this.cloud(Math.round(s.cols * 0.7), 6, 12);
    this.cloud(Math.round(s.cols * 0.52), 9, 7);
  }

  private cloud(col: number, row: number, w: number): void {
    const s = this.s;
    for (let i = 0; i < w; i++) {
      const edge = i === 0 || i === w - 1;
      s.glyph(col + i, row, edge ? "░" : "▒", C.blue4, 0.7);
      if (i > 1 && i < w - 1) s.glyph(col + i, row - 1, "░", C.blue4, 0.55);
    }
  }

  private drawScenery(layout: Layout): void {
    const s = this.s;
    const horizon = layout.laneRow - 1;

    // a continuous crenellated curtain wall along the far side of the lists
    const wallRow = horizon - 3;
    for (let i = 1; i < s.cols - 1; i++) {
      s.glyph(i, wallRow + 1, "▒", C.blue3, 0.5);
      s.glyph(i, wallRow + 2, "▒", C.blue2, 0.55);
      s.glyph(i, wallRow, i % 2 === 0 ? "▄" : " ", C.blue3, 0.5); // battlements
    }
    // a few taller towers with conical roofs
    const cx = Math.floor(s.cols / 2);
    for (const t of [-Math.floor(s.cols * 0.32), -10, cx > 30 ? 12 : 8, Math.floor(s.cols * 0.32)]) {
      const col = cx + t;
      if (col < 2 || col > s.cols - 3) continue;
      s.glyph(col, wallRow - 2, "▲", C.blue2, 0.55);
      s.text(col - 1, wallRow - 1, "▟█▙", C.blue2, 0.55);
      s.text(col - 1, wallRow, "███", C.blue2, 0.6);
    }

    // banner poles with little pennants flying along the rail
    for (let i = 4; i < s.cols - 4; i += 9) {
      s.glyph(i, horizon - 1, "╿", C.blue2, 0.5);
      s.glyph(i + 1, horizon - 1, "◣", i % 18 === 4 ? C.gold : C.blue3, 0.6);
    }
  }

  private drawLane(layout: Layout): void {
    const s = this.s;
    const row = layout.laneRow;
    // ground band (dithered toward parchment)
    ditherFill(s, 0, row + 1, s.cols, s.rows - row - 1, 0.34, 0.06, C.blue2);
    // the wooden tilt barrier down the middle of the lists
    for (let i = 0; i < s.cols; i++) {
      s.glyph(i, row, i % 7 === 3 ? "╤" : "═", C.blue1);
    }
    for (let i = 3; i < s.cols; i += 7) s.glyph(i, row + 1, "║", C.blue1, 0.7);
  }

  // ---- knights ----------------------------------------------------------
  private frameKey(e: Engine, player: 0 | 1): "g1" | "g2" | "rear" {
    if (e.screen === "matchOver" && e.match.matchWinner === player) return "rear";
    const riding = e.screen === "playing" || e.screen === "clash" || e.screen === "roundIntro";
    if (!riding) return "g1";
    return Math.floor(e.titleT * 0.012) % 2 === 0 ? "g1" : "g2";
  }

  private drawKnights(e: Engine, layout: Layout): void {
    this.drawKnight(e, 0, layout.p0x, layout);
    this.drawKnight(e, 1, layout.p1x, layout);
  }

  private drawKnight(e: Engine, player: 0 | 1, x: number, layout: Layout): void {
    const s = this.s;
    const v = e.knights[player];
    const mirror = player === 1;
    const bob = Math.round(v.bob);
    const top = layout.knightTop + bob;

    const fk = this.frameKey(e, player);
    const meta: Sprite = KNIGHT_FRAMES[fk];
    const art = getArt(`knight_${fk}`);
    const flash = v.flash > 0.5;

    if (art) {
      drawArtSprite(s, x, top, art, mirror, flash);
    } else {
      for (let r = 0; r < meta.rows.length; r++) {
        const line = meta.rows[r] as string;
        for (let i = 0; i < line.length; i++) {
          const idx = mirror ? line.length - 1 - i : i;
          const ch = line[idx] as string;
          if (ch === " ") continue;
          const shade = flash ? C.parchment : blueShade(glyphTone(ch));
          s.glyph(x + i, top + r, ch, shade);
        }
      }
    }

    // plume crest in the player's accent colour (tells the knights apart)
    const plumeCol = mirror ? KNIGHT_W - 1 - 13 : 13;
    s.glyph(x + plumeCol, top + 1, "❦", ACCENT[player], 0.95);
    s.glyph(x + plumeCol, top, "❜", ACCENT[player], 0.8);

    // couched lance, extends toward the centre on a strike / charge
    this.drawLance(player, x, top, v.lance, meta, e);
  }

  private drawLance(
    player: 0 | 1,
    x: number,
    top: number,
    lance: number,
    sprite: Sprite,
    e: Engine,
  ): void {
    const s = this.s;
    const accent = ACCENT[player];
    const handRow = top + sprite.hand.row;
    const base = lance * 0.45 + (e.screen === "clash" ? 0.6 : 0.45);
    const len = Math.max(10, Math.round(22 * base));
    const dir = player === 0 ? 1 : -1;
    const hx = player === 0 ? x + sprite.hand.col : x + (KNIGHT_W - 1 - sprite.hand.col);
    s.glyph(hx, handRow, "◆", accent, 0.95); // vamplate guard
    for (let i = 1; i <= len; i++) s.glyph(hx + dir * i, handRow, "━", C.ink);
    // fluttering pennon a little behind the tip
    s.glyph(hx + dir * (len - 2), handRow - 1, dir > 0 ? "◣" : "◢", accent, 0.9);
    s.glyph(hx + dir * (len - 1), handRow, dir > 0 ? "►" : "◄", C.blue0);
  }

  // ---- HUD --------------------------------------------------------------
  private drawHud(e: Engine): void {
    const s = this.s;
    this.drawBanner(e, 0, 1, true);
    this.drawBanner(e, 1, s.cols - 23, false);

    // round pips, centred at very top
    const pips = e.settings.rounds;
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
        col = C.gold;
      }
      s.glyph(startCol + i * 2, 0, ch, col);
    }
  }

  private drawBanner(e: Engine, player: 0 | 1, col: number, left: boolean): void {
    const s = this.s;
    const w = 22;
    const accent = ACCENT[player];
    const accentDeep = ACCENT_DEEP[player];
    drawFrame(s, col, 1, w, 4, { color: accentDeep, double: true, fill: C.parchment });
    const name = e.settings.names[player].slice(0, 12);
    s.text(col + 2, 1, ` ${name} `, accent);
    const hpT = e.knights[player].hp / e.match.config.maxHp;
    meter(s, col + 2, 2, w - 4, hpT, accent);
    const hp = Math.ceil(e.knights[player].hp);
    const hpStr = `${hp} HP`;
    s.text(col + (left ? 2 : w - 2 - hpStr.length), 3, hpStr, accentDeep);
  }

  // ---- centre prompt / clash -------------------------------------------
  private drawCenter(e: Engine, layout: Layout): void {
    const s = this.s;
    if (e.screen === "playing" && e.problem) {
      const text = `${e.problem.text} = ?`;
      const w = text.length + 6;
      const col = Math.floor((s.cols - w) / 2);
      drawFrame(s, col, 5, w, 3, { color: C.gold, double: true, fill: C.parchment });
      s.text(col + 3, 6, text, C.blue0);
      // little hanging banner ties
      s.glyph(col, 4, "╤", C.gold);
      s.glyph(col + w - 1, 4, "╤", C.gold);
    }

    if (e.screen === "clash" || e.screen === "roundResult") {
      const txt = e.banner;
      const col = Math.floor((s.cols - txt.length) / 2);
      const flicker = e.screen === "clash" && Math.floor(e.titleT * 0.02) % 2 === 0;
      s.text(col, 5, txt, flicker ? C.goldBright : C.vermilion);
      if (e.screen === "roundResult" && e.lastDamage > 0) {
        const dmg = `-${e.lastDamage}`;
        s.text(Math.floor((s.cols - dmg.length) / 2), layout.laneRow - KNIGHT_H - 1, dmg, C.vermilion);
        s.textCenter(s.rows - 2, "press  ENTER  to continue", C.blue2, 0.8);
      }
    }
  }

  private drawTitleScene(layout: Layout, e: Engine): void {
    const s = this.s;
    // the heraldic emblem (baked from an SVG by the ASCII baker), crowning the page
    const emblem = getArt("emblem");
    if (emblem) {
      const col = Math.floor((s.cols - emblem.w) / 2);
      drawArtSprite(s, col, 1, emblem, false, false);
    }
    // two knights face off on the title screen
    this.drawKnight(e, 0, 4, layout);
    this.drawKnight(e, 1, s.cols - 4 - KNIGHT_W, layout);
    divider(s, 6, layout.laneRow + 3, s.cols - 12, C.gold);
  }

  // ---- events -> particles ---------------------------------------------
  private drainEvents(e: Engine, layout: Layout): void {
    if (e.events.length === 0) return;
    for (const ev of e.events) {
      if (ev.type === "hoof") {
        const x = ev.player === 0 ? layout.p0x + 4 : layout.p1x + KNIGHT_W - 4;
        this.particles.spawn(x, layout.laneRow, 6, {
          color: C.blue3,
          dir: ev.player === 0 ? Math.PI : 0,
          spread: 0.5,
          speed: 0.05,
          gravity: 0.001,
          life: 520,
        });
      } else if (ev.type === "wrong") {
        const x = ev.player === 0 ? layout.p0x + 6 : layout.p1x + KNIGHT_W - 6;
        this.particles.spawn(x, layout.knightTop + 2, 7, {
          color: C.vermilion,
          dir: -Math.PI / 2,
          spread: Math.PI,
          speed: 0.06,
          life: 600,
          glyph: "✘",
        });
      } else if (ev.type === "clash") {
        const cx = Math.floor(s_center(this.s));
        this.particles.spawn(cx, layout.laneRow - 2, ev.crit ? 46 : 30, {
          color: C.goldBright,
          dir: -Math.PI / 2,
          spread: Math.PI,
          speed: ev.crit ? 0.11 : 0.085,
          gravity: 0.006,
          life: 950,
        });
        this.particles.spawn(cx, layout.laneRow - 2, 14, {
          color: C.vermilion,
          spread: Math.PI,
          speed: 0.07,
          life: 700,
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
    // scanlines
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = C.ink;
    for (let y = 0; y < s.cssH; y += 3) ctx.fillRect(0, y, s.cssW, 1);
    ctx.globalAlpha = 1;

    // vignette
    const g = ctx.createRadialGradient(
      s.cssW / 2,
      s.cssH / 2,
      Math.min(s.cssW, s.cssH) * 0.35,
      s.cssW / 2,
      s.cssH / 2,
      Math.max(s.cssW, s.cssH) * 0.7,
    );
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(11,26,74,0.34)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s.cssW, s.cssH);

    if (this.artFlash > 0.01) {
      ctx.globalAlpha = this.artFlash * 0.5;
      ctx.fillStyle = C.parchment;
      ctx.fillRect(0, 0, s.cssW, s.cssH);
      ctx.globalAlpha = 1;
    }
  }
}

function s_center(s: Screen): number {
  return s.cols / 2;
}

// Draw a baked dithered-ASCII sprite {rows, colors} at a cell position.
function drawArtSprite(
  s: Screen,
  col: number,
  row: number,
  art: { rows: string[]; shades: number[][] },
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
  void easeInQuad;
}
