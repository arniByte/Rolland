import type { Mode } from "../game/engine";
import type { GameController } from "../game/view";
import type { Online } from "../net/session";
import type { Audio } from "../core/audio";
import type { Difficulty } from "../game/problems";
import { DIFFICULTY_LABEL, CHALLENGES } from "../game/problems";
import { KEY_HINTS } from "../core/input";
import type { PlayerId } from "../game/match";

type Attrs = Record<string, string | EventListener>;

/** Online play is unavailable in the offline single-file build (no network). */
const ONLINE_ENABLED = import.meta.env.MODE !== "single";

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
    private online: Online,
    private audio: Audio,
  ) {
    this.content = el("div", { id: "ui-content", class: "uic" });
    this.root.append(this.content);
  }

  /** the currently-active controller (host Engine, or the guest's RemoteView) */
  private get ctrl(): GameController {
    return this.online.controller;
  }

  render(): void {
    const e = this.ctrl;
    this.root.dataset.mode = e.settings.mode;
    this.root.dataset.screen = e.screen;
    // online = each player on their own device → one pad, upright (no table flip)
    if (e.settings.mode === "online") this.root.dataset.solo = "1";
    else this.root.removeAttribute("data-solo");

    // a fled foe pre-empts every in-match screen
    if (this.online.active && this.online.state === "peerLeft") {
      this.sig = "";
      this.content.replaceChildren();
      this.renderPeerLeft();
      return;
    }

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
      case "lobby":
        this.renderLobby();
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
      this.ctrl.confirm();
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

  /** A labelled segmented control (shared by setup + the online lobby). */
  private segRow(
    label: string,
    options: { v: string; t: string }[],
    get: () => string,
    set: (v: string) => void,
  ): HTMLElement {
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
            this.ctrl.confirm();
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
    const e = this.ctrl;
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
        if (i === this.modeIndex) this.ctrl.pickTrial(info.kind);
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
          if (cur) this.ctrl.pickTrial(cur.kind);
        }, true),
        this.button("▶", () => select(this.modeIndex + 1)),
      ),
    );
    view.append(el("div", { class: "row" }, this.button("◀ BACK", () => this.ctrl.back())));
    this.content.append(view);
  }

  // ---- setup ----
  private renderSetup(): void {
    const e = this.ctrl;
    const s = e.settings;

    const foes = [
      { v: "local2p", t: "TWO KNIGHTS" },
      { v: "ai", t: "VS SQUIRE" },
    ];
    if (ONLINE_ENABLED) foes.push({ v: "online", t: "ONLINE" });

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
      this.segRow(
        "FOES",
        foes,
        () => s.mode,
        (v) => {
          s.mode = v as Mode;
          this.root.dataset.mode = v;
        },
      ),
      this.segRow(
        "LORE",
        (["squire", "knight", "champion"] as Difficulty[]).map((d) => ({ v: d, t: DIFFICULTY_LABEL[d] })),
        () => s.difficulty,
        (v) => (s.difficulty = v as Difficulty),
      ),
      this.segRow(
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
        this.button("◀ BACK", () => this.ctrl.back()),
        this.button(s.mode === "online" ? "ENTER A KEEP ▶" : "TO ARMS! ▶", () => this.ctrl.confirm(), true),
      ),
    );

    this.content.append(el("div", { class: "overlay" }, scroll));
  }

  // ---- lobby (online rooms) ----
  private renderLobby(): void {
    const o = this.online;
    const e = this.ctrl;
    const s = e.settings;
    const scroll = el("div", { class: "scroll" });
    scroll.append(el("div", { class: "ornament" }, "✦ enter a keep ✦"));
    scroll.append(el("h2", {}, "ONLINE TILT"));

    if (!o.active) {
      const nameField = el("input", {
        class: "namefield",
        maxlength: "12",
        placeholder: "THY NAME",
        value: o.localName,
        "aria-label": "your name",
      }) as HTMLInputElement;
      nameField.addEventListener("input", () => {
        o.localName = nameField.value.toUpperCase();
      });
      scroll.append(el("div", { class: "optline" }, el("span", { class: "label" }, "NAME"), nameField));

      scroll.append(el("div", { class: "row" }, this.button("⚔ CREATE ROOM", () => void o.createGame(), true)));
      scroll.append(el("div", { class: "lobby-or" }, "— or —"));

      const codeField = el("input", {
        class: "namefield code-input",
        maxlength: "4",
        placeholder: "CODE",
        "aria-label": "room code",
      }) as HTMLInputElement;
      scroll.append(
        el(
          "div",
          { class: "optline" },
          codeField,
          this.button("JOIN ▶", () => void o.joinGame(codeField.value)),
        ),
      );
      scroll.append(el("div", { class: "row" }, this.button("◀ BACK", () => this.ctrl.back())));
    } else {
      scroll.append(el("div", { class: "lobby-state" }, this.lobbyStateLine()));
      if (o.role === "host" && o.roomCode) {
        scroll.append(el("div", { class: "code" }, o.roomCode));
        scroll.append(el("div", { class: "hint" }, "speak this code to thy foe"));
      }

      if (o.role === "host") {
        scroll.append(
          this.segRow(
            "LORE",
            (["squire", "knight", "champion"] as Difficulty[]).map((d) => ({ v: d, t: DIFFICULTY_LABEL[d] })),
            () => s.difficulty,
            (v) => {
              s.difficulty = v as Difficulty;
              o.pushSettings();
            },
          ),
        );
        scroll.append(
          this.segRow(
            "ROUNDS",
            [
              { v: "3", t: "3" },
              { v: "5", t: "5" },
              { v: "7", t: "7" },
            ],
            () => String(s.rounds),
            (v) => {
              s.rounds = parseInt(v, 10);
              o.pushSettings();
            },
          ),
        );
      } else if (o.remoteSettings) {
        const rs = o.remoteSettings;
        scroll.append(
          el(
            "div",
            { class: "lobby-decree" },
            `THE HOST DECREES — ${DIFFICULTY_LABEL[rs.difficulty]} · ${rs.rounds} ROUNDS · ${rs.challenge.toUpperCase()}`,
          ),
        );
      }

      const row = el("div", { class: "row", style: "margin-top:0.7rem" });
      if (o.state === "connected" && o.role === "host") {
        row.append(this.button("TO ARMS! ▶", () => o.start(), true));
      } else if (o.state === "connected" && o.role === "guest") {
        scroll.append(el("div", { class: "hint" }, "awaiting the host's command…"));
      }
      row.append(this.button("LEAVE", () => o.leave()));
      scroll.append(row);
    }

    this.content.append(el("div", { class: "overlay" }, scroll));
  }

  private lobbyStateLine(): string {
    const o = this.online;
    switch (o.state) {
      case "creating":
        return "forging a keep…";
      case "waiting":
        return "awaiting a challenger…";
      case "connecting":
        return "hailing the keep…";
      case "connected":
        return o.role === "host" ? "a challenger stands ready" : "thou art admitted";
      case "peerLeft":
        return "thy foe has fled the lists";
      case "error":
        return o.error || "the connection faltered";
      default:
        return "";
    }
  }

  private renderPeerLeft(): void {
    const panel = el(
      "div",
      { class: "overlay" },
      el("div", { class: "scroll" }, el("div", { class: "ornament" }, "✶ ✶ ✶"), el("h2", {}, "THY FOE HAS FLED")),
      el("div", { class: "row" }, this.button("MENU", () => this.online.leave(), true)),
    );
    this.content.append(panel);
  }

  // ---- pads ----
  private padPlayers(): PlayerId[] {
    const e = this.ctrl;
    return e.settings.mode === "local2p" ? [0, 1] : [e.localPlayer];
  }

  private renderPads(): void {
    const e = this.ctrl;
    if (!e.problem) return;
    this.tiles = [[], []];
    for (const p of this.padPlayers()) this.content.append(this.buildPad(p));
  }

  private heartsEl(player: PlayerId): HTMLElement {
    const e = this.ctrl;
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
    const e = this.ctrl;
    const problem = e.problem!;
    const hints = KEY_HINTS[player];
    const strike = e.settings.challenge === "quickdraw";
    const local2p = e.settings.mode === "local2p";

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
        if (local2p) this.ctrl.answer(player, choice);
        else this.ctrl.answerLocal(choice);
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
    const e = this.ctrl;
    if (!e.problem) return;
    const revealing = e.isRevealing();
    for (const p of this.padPlayers()) {
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
    const e = this.ctrl;
    const online = e.settings.mode === "online";
    const isGuest = online && e.localPlayer === 1;

    const actions = el("div", { class: "row" });
    if (isGuest) {
      actions.append(this.button("LEAVE", () => this.online.leave(), true));
    } else if (online) {
      actions.append(this.button("⚔ REMATCH", () => this.ctrl.startMatch(), true));
      actions.append(this.button("LEAVE", () => this.online.leave()));
    } else {
      actions.append(this.button("⚔ REMATCH", () => this.ctrl.startMatch(), true));
      actions.append(this.button("MENU", () => this.ctrl.back()));
    }

    const scrollKids: (Node | string)[] = [el("div", { class: "ornament" }, "✦ ❦ ✦"), el("h2", {}, e.banner)];
    if (isGuest) scrollKids.push(el("div", { class: "hint" }, "the host may call a rematch"));

    this.content.append(el("div", { class: "overlay" }, el("div", { class: "scroll" }, ...scrollKids), actions));
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
