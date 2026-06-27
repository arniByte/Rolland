import { Engine, type Mode } from "../game/engine";
import type { Audio } from "../core/audio";
import type { Difficulty } from "../game/problems";
import { DIFFICULTY_LABEL, CHALLENGES } from "../game/problems";
import { KEY_HINTS } from "../core/input";
import type { PlayerId } from "../game/match";

type Attrs = Record<string, string | EventListener>;

function el(tag: string, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElement {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === "function") n.addEventListener(k, v);
    else if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const kid of kids) n.append(kid);
  return n;
}

export class UI {
  private content: HTMLElement;
  private sig = "";
  private tiles: [HTMLElement[], HTMLElement[]] = [[], []];
  private modeIndex = 0;

  constructor(
    private root: HTMLElement,
    private engine: Engine,
    private audio: Audio,
  ) {
    this.content = el("div", { id: "ui-content", class: "uic" });
    this.root.append(this.content);
  }

  render(): void {
    const e = this.engine;
    this.root.dataset.mode = e.settings.mode;
    this.root.dataset.screen = e.screen;

    // During play, only the structure-defining bits force a rebuild; attempt
    // state changes just re-sync classes (keeps taps snappy, preserves focus).
    const sig = [
      e.screen,
      e.settings.mode,
      e.settings.challenge,
      e.problem ? e.problem.choices.join(",") + (e.problem.revealMs ?? "") : "",
    ].join("|");
    if (e.screen === "playing" && sig === this.sig) {
      this.syncPads();
      return;
    }
    this.sig = sig;

    this.content.replaceChildren();
    switch (e.screen) {
      case "title":
        this.renderTitle();
        break;
      case "modes":
        this.renderModes();
        break;
      case "setup":
        this.renderSetup();
        break;
      case "roundIntro":
        this.content.append(this.veil());
        break;
      case "playing":
        this.renderPads();
        this.syncPads();
        break;
      case "clash":
        break;
      case "roundResult":
        this.content.append(this.veil());
        break;
      case "matchOver":
        this.renderMatchOver();
        break;
    }
  }

  private veil(): HTMLElement {
    const v = el("div", { class: "veil" });
    v.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      this.audio.resume();
      this.engine.confirm();
    });
    return v;
  }

  private soundToggle(): HTMLElement {
    const b = el("button", { class: "btn ghost", "aria-label": "toggle sound" });
    const sync = (): void => {
      b.textContent = this.audio.muted ? "♩ SOUND · OFF" : "♪ SOUND · ON";
    };
    sync();
    b.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      this.audio.resume();
      this.audio.toggleMute();
      this.audio.select();
      sync();
    });
    return b;
  }

  // ---- title ----
  private renderTitle(): void {
    this.content.append(this.veil());
    const panel = el(
      "div",
      { class: "overlay" },
      el("div", { class: "ornament" }, "❦ · ✦ · ❦"),
      el("h1", { class: "wordmark" }, "Roland"),
      el("div", { class: "tagline" }, "✶ an ascii joust ✶"),
      el(
        "button",
        {
          class: "btn primary",
          pointerdown: (ev: Event) => {
            ev.preventDefault();
            this.audio.resume();
            this.engine.confirm();
          },
        },
        "⚔  ENTER THE LISTS  ⚔",
      ),
      el("div", { class: "row" }, this.soundToggle()),
      el("div", { class: "hint" }, "press ENTER · or tap"),
    );
    this.content.append(panel);
  }

  // ---- modes (swipe carousel of trials) ----
  private renderModes(): void {
    const e = this.engine;
    const found = CHALLENGES.findIndex((c) => c.kind === e.settings.challenge);
    this.modeIndex = found < 0 ? 0 : found;

    const select = (i: number): void => {
      this.modeIndex = (i + CHALLENGES.length) % CHALLENGES.length;
      const cur = CHALLENGES[this.modeIndex];
      if (cur) e.settings.challenge = cur.kind;
      this.audio.resume();
      this.audio.select();
      this.render();
    };

    const view = el("div", { class: "overlay" });
    view.append(el("div", { class: "ornament" }, "⟨  choose thy trial  ⟩"));

    const viewport = el("div", { class: "carousel" });
    const track = el("div", { class: "carousel-track" });
    track.style.transform = `translateX(${-this.modeIndex * 100}%)`;
    CHALLENGES.forEach((info, i) => {
      const card = el(
        "div",
        { class: "room" + (i === this.modeIndex ? " on" : "") },
        el("div", { class: "room-icon" }, info.icon),
        el("h2", {}, info.name),
        el("div", { class: "room-blurb" }, info.blurb),
        el("div", { class: "room-tag" }, i === this.modeIndex ? "▼ tap to enter ▼" : ""),
      );
      card.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        if (i === this.modeIndex) this.engine.pickTrial(info.kind);
        else select(i);
      });
      track.append(card);
    });
    viewport.append(track);

    // horizontal swipe to change rooms
    let sx = 0;
    let active = false;
    viewport.addEventListener("pointerdown", (ev) => {
      active = true;
      sx = ev.clientX;
    });
    viewport.addEventListener("pointerup", (ev) => {
      if (!active) return;
      active = false;
      const dx = ev.clientX - sx;
      if (dx < -40) select(this.modeIndex + 1);
      else if (dx > 40) select(this.modeIndex - 1);
    });
    view.append(viewport);

    const dots = el("div", { class: "dots" });
    CHALLENGES.forEach((_, i) => dots.append(el("span", { class: "dot" + (i === this.modeIndex ? " on" : "") })));
    view.append(dots);

    view.append(
      el(
        "div",
        { class: "row" },
        this.button("◀", () => select(this.modeIndex - 1)),
        this.button("ENTER ⚔", () => {
          const cur = CHALLENGES[this.modeIndex];
          if (cur) this.engine.pickTrial(cur.kind);
        }, true),
        this.button("▶", () => select(this.modeIndex + 1)),
      ),
    );
    view.append(el("div", { class: "row" }, this.button("◀ BACK", () => this.engine.back())));
    this.content.append(view);
  }

  // ---- setup ----
  private renderSetup(): void {
    const e = this.engine;
    const s = e.settings;

    const seg = (
      label: string,
      options: { v: string; t: string }[],
      get: () => string,
      set: (v: string) => void,
    ): HTMLElement => {
      const segEl = el("div", { class: "seg" });
      const refresh = (): void => {
        segEl.querySelectorAll("button").forEach((b) => {
          b.classList.toggle("on", (b as HTMLElement).dataset.v === get());
        });
      };
      for (const o of options) {
        const b = el("button", { "data-v": o.v }, o.t);
        b.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          this.audio.resume();
          this.audio.select();
          set(o.v);
          refresh();
        });
        segEl.append(b);
      }
      refresh();
      return el("div", { class: "optline" }, el("span", { class: "label" }, label), segEl);
    };

    const name = (player: PlayerId): HTMLElement => {
      const input = el("input", {
        class: "namefield",
        maxlength: "12",
        value: s.names[player],
        "aria-label": `Player ${player + 1} name`,
      }) as HTMLInputElement;
      input.addEventListener("input", () => {
        s.names[player] = input.value.toUpperCase() || (player === 0 ? "ROLAND" : "OLIVIER");
      });
      return input;
    };

    const scroll = el(
      "div",
      { class: "scroll" },
      el("h2", {}, "Prepare for the Tilt"),
      seg(
        "FOES",
        [
          { v: "local2p", t: "TWO KNIGHTS" },
          { v: "ai", t: "VS SQUIRE" },
        ],
        () => s.mode,
        (v) => {
          s.mode = v as Mode;
          this.root.dataset.mode = v;
        },
      ),
      seg(
        "LORE",
        (["squire", "knight", "champion"] as Difficulty[]).map((d) => ({ v: d, t: DIFFICULTY_LABEL[d] })),
        () => s.difficulty,
        (v) => (s.difficulty = v as Difficulty),
      ),
      seg(
        "ROUNDS",
        [
          { v: "3", t: "3" },
          { v: "5", t: "5" },
          { v: "7", t: "7" },
        ],
        () => String(s.rounds),
        (v) => (s.rounds = parseInt(v, 10)),
      ),
      el("div", { class: "optline" }, el("span", { class: "label" }, "NAMES"), name(0), name(1)),
      el("div", { class: "optline" }, el("span", { class: "label" }, "SOUND"), this.soundToggle()),
      el(
        "div",
        { class: "row", style: "margin-top:0.8rem" },
        this.button("◀ BACK", () => this.engine.back()),
        this.button("TO ARMS! ▶", () => this.engine.confirm(), true),
      ),
    );

    this.content.append(el("div", { class: "overlay" }, scroll));
  }

  // ---- pads ----
  private renderPads(): void {
    const e = this.engine;
    if (!e.problem) return;
    this.tiles = [[], []];
    this.content.append(this.buildPad(0));
    if (e.settings.mode === "local2p") this.content.append(this.buildPad(1));
  }

  private heartsEl(player: PlayerId): HTMLElement {
    const e = this.engine;
    const max = 5;
    const filled = Math.max(
      0,
      Math.min(max, Math.round((e.match.knights[player].hp / e.match.config.maxHp) * max)),
    );
    const wrap = el("span", { class: "eq-hp" });
    for (let i = 0; i < max; i++) wrap.append(el("span", { class: i < filled ? "hp on" : "hp off" }, "♥"));
    return wrap;
  }

  private buildPad(player: PlayerId): HTMLElement {
    const e = this.engine;
    const problem = e.problem!;
    const hints = KEY_HINTS[player];
    const strike = e.settings.challenge === "quickdraw";

    const pad = el("div", { class: `pad p${player}${strike ? " strike-pad" : ""}` });
    pad.append(
      el(
        "div",
        { class: "eq" },
        el(
          "div",
          { class: "eq-head" },
          el("span", { class: "eq-name" }, e.settings.names[player]),
          this.heartsEl(player),
        ),
        el("div", { class: "eq-prob" }, strike ? "QUICK DRAW" : `${problem.text} = ?`),
      ),
    );

    const addTile = (label: string, choice: number, extra = ""): void => {
      const btn = el(
        "button",
        { class: `answer${extra}`, "aria-label": label },
        el("span", { class: "key" }, hints[choice] ?? ""),
        document.createTextNode(label),
      );
      btn.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.audio.resume();
        this.engine.answer(player, choice);
      });
      this.tiles[player].push(btn);
      pad.append(btn);
    };

    if (strike) {
      addTile("⚔ STRIKE", 0, " strike");
    } else {
      problem.choices.forEach((value, i) => addTile(String(value), i));
    }
    return pad;
  }

  /** Update tile state classes in place (no rebuild → snappy, focus-safe). */
  private syncPads(): void {
    const e = this.engine;
    if (!e.problem) return;
    const revealing = e.isRevealing();
    const players: PlayerId[] = e.settings.mode === "local2p" ? [0, 1] : [0];
    for (const p of players) {
      const attempt = e.attempts[p];
      this.tiles[p].forEach((btn, i) => {
        btn.classList.toggle("wrong", attempt.choice === i && attempt.state === "wrong");
        btn.classList.toggle("correct", attempt.choice === i && attempt.state === "correct");
        const reveal = revealing && i === e.problem!.correct;
        btn.classList.toggle("reveal", reveal);
        if (reveal) btn.classList.add("correct");
        btn.classList.toggle("locked", revealing || attempt.state !== "idle");
      });
    }
  }

  // ---- result / match over ----
  private renderMatchOver(): void {
    const e = this.engine;
    const panel = el(
      "div",
      { class: "overlay" },
      el("div", { class: "scroll" }, el("div", { class: "ornament" }, "✦ ❦ ✦"), el("h2", {}, e.banner)),
      el(
        "div",
        { class: "row" },
        this.button("⚔ REMATCH", () => this.engine.startMatch(), true),
        this.button("MENU", () => this.engine.back()),
      ),
    );
    this.content.append(panel);
  }

  // ---- helper ----
  private button(label: string, fn: () => void, primary = false): HTMLElement {
    const b = el("button", { class: primary ? "btn primary" : "btn" }, label);
    b.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      this.audio.resume();
      this.audio.select();
      fn();
    });
    return b;
  }
}
