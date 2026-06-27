import { Engine, type Mode, type ScreenName } from "../game/engine";
import type { Audio } from "../core/audio";
import type { Difficulty } from "../game/problems";
import { DIFFICULTY_LABEL } from "../game/problems";
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

  constructor(
    private root: HTMLElement,
    private engine: Engine,
    private audio: Audio,
  ) {
    this.content = el("div", { id: "ui-content", class: "uic" });
    this.root.append(this.content);
    this.root.append(this.buildTopbar());
  }

  private buildTopbar(): HTMLElement {
    const mute = el("button", { class: "icon-btn", title: "sound", "aria-label": "toggle sound" }, "♪");
    mute.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.audio.resume();
      const m = this.audio.toggleMute();
      mute.textContent = m ? "♩" : "♪";
    });
    return el("div", { class: "topbar" }, mute);
  }

  render(): void {
    const e = this.engine;
    this.root.dataset.mode = e.settings.mode;
    this.root.dataset.screen = e.screen;
    this.content.replaceChildren();

    switch (e.screen) {
      case "title":
        this.renderTitle();
        break;
      case "setup":
        this.renderSetup();
        break;
      case "roundIntro":
        this.content.append(this.veil());
        break;
      case "playing":
        this.renderPads();
        break;
      case "clash":
        break; // no controls during the charge
      case "roundResult":
        this.renderResult();
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

  // ---- title ----
  private renderTitle(): void {
    this.content.append(this.veil());
    const panel = el(
      "div",
      { class: "overlay" },
      el("h1", { class: "wordmark" }, "Roland"),
      el("div", { class: "tagline" }, "an ascii joust"),
      el(
        "button",
        {
          class: "btn gold",
          pointerdown: (e: Event) => {
            e.preventDefault();
            this.audio.resume();
            this.audio.startMusic();
            this.engine.confirm();
          },
        },
        "ENTER THE LISTS",
      ),
      el("div", { class: "hint" }, "press ENTER · or tap"),
    );
    this.content.append(panel);
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
          { v: "ai", t: "VS SQUIRE AI" },
        ],
        () => s.mode,
        (v) => {
          s.mode = v as Mode;
          this.root.dataset.mode = v;
        },
      ),
      seg(
        "LORE",
        (["squire", "knight", "champion"] as Difficulty[]).map((d) => ({
          v: d,
          t: DIFFICULTY_LABEL[d],
        })),
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
      el(
        "div",
        { class: "optline" },
        el("span", { class: "label" }, "NAMES"),
        name(0),
        name(1),
      ),
      el(
        "div",
        { class: "row", style: "margin-top:1rem" },
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
    const pad0 = this.buildPad(0);
    this.content.append(pad0);
    if (e.settings.mode === "local2p") this.content.append(this.buildPad(1));
  }

  private buildPad(player: PlayerId): HTMLElement {
    const e = this.engine;
    const problem = e.problem!;
    const attempt = e.attempts[player];
    const revealing = e.isRevealing();
    const hints = KEY_HINTS[player];

    const pad = el("div", { class: `pad p${player}` });
    pad.append(el("div", { class: "tag" }, e.settings.names[player]));

    problem.choices.forEach((value, i) => {
      const btn = el(
        "button",
        { class: "answer", "data-choice": String(i) },
        el("span", { class: "key" }, hints[i] ?? ""),
        document.createTextNode(String(value)),
      );

      if (attempt.choice === i && attempt.state === "wrong") btn.classList.add("wrong");
      if (attempt.choice === i && attempt.state === "correct") btn.classList.add("correct");
      if (revealing) {
        btn.classList.add("locked");
        if (i === problem.correct) btn.classList.add("reveal", "correct");
      }
      if (attempt.state !== "idle") btn.classList.add("locked");

      btn.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        this.audio.resume();
        this.engine.answer(player, i);
      });
      pad.append(btn);
    });

    return pad;
  }

  // ---- result / match over ----
  private renderResult(): void {
    this.content.append(this.veil());
  }

  private renderMatchOver(): void {
    const e = this.engine;
    const panel = el(
      "div",
      { class: "overlay" },
      el("div", { class: "scroll" }, el("h2", {}, e.banner)),
      el(
        "div",
        { class: "row" },
        this.button("REMATCH", () => this.engine.startMatch(), true),
        this.button("MENU", () => {
          this.engine.back();
        }),
      ),
    );
    this.content.append(panel);
  }

  // ---- helper ----
  private button(label: string, fn: () => void, gold = false): HTMLElement {
    const b = el("button", { class: gold ? "btn gold" : "btn" }, label);
    b.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      this.audio.resume();
      this.audio.select();
      fn();
    });
    return b;
  }
}

// keep ScreenName referenced for type help
export type { ScreenName };
