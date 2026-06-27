// The online orchestrator. One `Online` instance per client glues a Transport to
// either the host Engine (authoritative) or a guest RemoteView (mirror). It owns
// the lobby connection state machine and is the single source of "what's active":
// `view`/`controller` return the Engine for host/local/AI/guest-lobby, and the
// RemoteView once a guest's match is underway. It NEVER imports Trystero — the
// concrete transport arrives via the injected `makeTransport` factory, keeping the
// core bundle dependency-free.
import type { Engine } from "../game/engine";
import type { GameView, GameController } from "../game/view";
import type { Transport } from "./transport";
import { randomSeed } from "../game/rng";
import { RemoteView } from "./remoteView";
import { toSnapshot } from "./snapshot";
import { genRoomCode, normalizeCode } from "./room";
import { PING_MS, PEER_TIMEOUT_MS, CONNECT_TIMEOUT_MS, ROOM_CODE_LEN } from "./constants";
import {
  PROTO,
  isNetMsg,
  type NetMsg,
  type NetSettings,
  type Hello,
  type Welcome,
  type SettingsMsg,
  type Start,
  type Snap,
  type Input,
  type Confirm,
} from "./protocol";

export type OnlineRole = "host" | "guest";
export type OnlineState =
  | "idle"
  | "creating"
  | "waiting"
  | "connecting"
  | "connected"
  | "peerLeft"
  | "error";

export interface OnlineDeps {
  engine: Engine;
  onUiChange: () => void;
  /** lazily builds the prod transport (dynamic-imports Trystero); injected by main */
  makeTransport: (code: string) => Promise<Transport>;
}

export class Online {
  role: OnlineRole | null = null;
  state: OnlineState = "idle";
  roomCode = "";
  /** the name this device plays under (set by the lobby UI before connecting) */
  localName = "";
  error = "";
  /** guest-side: the host's settings, for read-only lobby display */
  remoteSettings: NetSettings | null = null;

  private transport: Transport | null = null;
  private remote: RemoteView | null = null;
  private peerId: string | null = null;
  private guestJoined = false;
  private started = false;
  private seq = 0;
  private prevProblemId = -1;
  private pingAccum = 0;
  private sincePeer = 0;
  private sinceConnect = 0;

  constructor(private deps: OnlineDeps) {}

  // ---- what main/UI read ------------------------------------------------
  get active(): boolean {
    return this.role !== null;
  }
  get guestInMatch(): boolean {
    return this.role === "guest" && this.remote !== null;
  }
  get hostInMatch(): boolean {
    return this.role === "host" && this.started && this.state === "connected";
  }
  get view(): GameView {
    return this.guestInMatch && this.remote ? this.remote : this.deps.engine;
  }
  get controller(): GameController {
    return this.guestInMatch && this.remote ? this.remote : this.deps.engine;
  }

  // ---- lobby actions ----------------------------------------------------
  /** Open the online lobby (title shortcut). */
  openLobby(): void {
    this.deps.engine.goOnline();
    this.deps.onUiChange();
  }

  /** Open the lobby and immediately join a code (shareable invite link). */
  async openAndJoin(code: string): Promise<void> {
    this.deps.engine.goOnline();
    await this.joinGame(code);
  }

  async createGame(): Promise<void> {
    if (this.state !== "idle") return;
    this.role = "host";
    this.state = "creating";
    this.error = "";
    this.deps.engine.settings.mode = "online";
    this.roomCode = genRoomCode();
    if (this.localName) this.deps.engine.settings.names[0] = this.localName;
    this.deps.onUiChange();
    try {
      this.transport = await this.deps.makeTransport(this.roomCode);
    } catch (e) {
      return this.fail(e);
    }
    this.wire();
    this.state = "waiting";
    this.deps.onUiChange();
  }

  async joinGame(rawCode: string): Promise<void> {
    if (this.state !== "idle") return;
    const code = normalizeCode(rawCode);
    if (code.length < ROOM_CODE_LEN) {
      this.error = "CODE INCOMPLETE";
      this.state = "error";
      this.role = "guest";
      this.deps.onUiChange();
      return;
    }
    this.role = "guest";
    this.state = "connecting";
    this.error = "";
    this.roomCode = code;
    this.sinceConnect = 0;
    this.deps.engine.settings.mode = "online";
    this.deps.onUiChange();
    try {
      this.transport = await this.deps.makeTransport(code);
    } catch (e) {
      return this.fail(e);
    }
    this.wire();
    this.deps.onUiChange();
  }

  /** host pressed TO ARMS — start the authoritative match and tell the guest. */
  start(): void {
    if (this.role !== "host" || this.state !== "connected") return;
    this.deps.engine.startMatch();
    this.started = true;
    this.prevProblemId = -1;
    this.send({ v: PROTO, t: "start", seed: randomSeed(), settings: this.netSettings() });
    this.deps.onUiChange();
  }

  /** host edited a lobby setting — broadcast it so the guest's display tracks. */
  pushSettings(): void {
    if (this.role === "host" && this.guestJoined) {
      this.send({ v: PROTO, t: "settings", settings: this.netSettings() });
    }
  }

  /** leave the room and return to the title. */
  leave(): void {
    this.send({ v: PROTO, t: "bye", reason: "left" });
    this.teardown();
    this.deps.engine.home();
    this.deps.onUiChange();
  }

  // ---- per-frame --------------------------------------------------------
  update(dt: number, now: number): void {
    if (this.guestInMatch && this.remote) this.remote.tick(now);
    if (!this.transport) return;
    // a guest that never finds a live keep should fail visibly, not hang forever
    if (this.role === "guest" && this.peerId === null && this.state === "connecting") {
      this.sinceConnect += dt;
      if (this.sinceConnect >= CONNECT_TIMEOUT_MS) {
        this.error = "NO KEEP FOUND";
        this.state = "error";
        this.deps.onUiChange();
        return;
      }
    }
    this.pingAccum += dt;
    if (this.pingAccum >= PING_MS) {
      this.pingAccum = 0;
      this.send({ v: PROTO, t: "ping" });
    }
    if (this.peerId !== null) {
      this.sincePeer += dt;
      if (this.sincePeer >= PEER_TIMEOUT_MS) this.handlePeerGone();
    }
  }

  /** host: push this frame's authoritative snapshot. */
  hostBroadcast(): void {
    if (!this.hostInMatch) return;
    this.seq++;
    this.send({ v: PROTO, t: "snap", seq: this.seq, s: toSnapshot(this.deps.engine, this.prevProblemId) });
    this.prevProblemId = this.deps.engine.problemId;
  }

  // ---- transport plumbing ----------------------------------------------
  private wire(): void {
    const tr = this.transport;
    if (!tr) return;
    tr.onMessage((m, peer) => this.onMessage(m, peer));
    tr.onPeerJoin((id) => this.onPeerJoin(id));
    tr.onPeerLeave((id) => this.onPeerLeave(id));
  }

  private onPeerJoin(id: string): void {
    if (this.peerId !== null) return; // strictly 1-on-1; ignore extra peers
    this.peerId = id;
    this.sincePeer = 0;
    this.sinceConnect = 0;
    this.state = "connecting";
    if (this.role === "guest") {
      this.send({ v: PROTO, t: "hello", name: this.localName || this.deps.engine.settings.names[1] });
    }
    this.deps.onUiChange();
  }

  private onPeerLeave(id: string): void {
    if (id !== this.peerId) return;
    this.handlePeerGone();
  }

  private handlePeerGone(): void {
    if (this.state === "peerLeft" || this.state === "idle") return;
    this.peerId = null;
    this.guestJoined = false;
    this.state = "peerLeft";
    this.deps.onUiChange();
  }

  private onMessage(m: NetMsg, _peer: string): void {
    if (!isNetMsg(m)) return;
    this.sincePeer = 0;
    // a malformed-but-same-version frame (only v/t are guaranteed) must never
    // throw out of the transport's receive callback — drop it and carry on.
    try {
      switch (m.t) {
        case "hello":
          this.onHello(m);
          break;
        case "welcome":
          this.onWelcome(m);
          break;
        case "settings":
          this.onSettings(m);
          break;
        case "start":
          this.onStart(m);
          break;
        case "snap":
          this.onSnap(m);
          break;
        case "input":
          this.onInput(m);
          break;
        case "confirm":
          this.onConfirm(m);
          break;
        case "ping":
          this.send({ v: PROTO, t: "pong" });
          break;
        case "pong":
          break;
        case "bye":
          this.handlePeerGone();
          break;
      }
    } catch {
      /* corrupt or forged frame — ignore, recover on the next valid one */
    }
  }

  private onHello(m: Hello): void {
    if (this.role !== "host" || this.guestJoined) return;
    this.guestJoined = true;
    this.deps.engine.settings.names[1] = (m.name || "OLIVIER").toUpperCase().slice(0, 12);
    this.state = "connected";
    this.send({ v: PROTO, t: "welcome", you: 1, settings: this.netSettings() });
    this.deps.onUiChange();
  }

  private onWelcome(m: Welcome): void {
    if (this.role !== "guest") return;
    this.remoteSettings = m.settings;
    this.state = "connected";
    this.deps.onUiChange();
  }

  private onSettings(m: SettingsMsg): void {
    if (this.role !== "guest") return;
    this.remoteSettings = m.settings;
    this.remote?.setSettings(m.settings);
    this.deps.onUiChange();
  }

  private onStart(m: Start): void {
    if (this.role !== "guest") return;
    this.remoteSettings = m.settings;
    this.remote = new RemoteView(
      (msg) => this.send(msg),
      () => this.leave(),
      m.settings,
    );
    this.deps.onUiChange();
  }

  private onSnap(m: Snap): void {
    if (!this.remote) return;
    if (this.remote.apply(m.s, m.seq)) this.deps.onUiChange();
  }

  private onInput(m: Input): void {
    if (this.role !== "host") return;
    this.deps.engine.answerRemote(1, m.problemId, m.choice, m.reactionMs, m.falseStart ?? false);
  }

  private onConfirm(m: Confirm): void {
    if (this.role !== "host") return;
    const s = this.deps.engine.screen;
    // only honour a confirm for an advanceable veil that still matches the host's
    // current screen — never matchOver (rematch/leave is the host's call alone).
    if (m.screen === s && (s === "roundIntro" || s === "roundResult")) {
      this.deps.engine.confirm();
    }
  }

  // ---- helpers ----------------------------------------------------------
  private netSettings(): NetSettings {
    const s = this.deps.engine.settings;
    return {
      difficulty: s.difficulty,
      rounds: s.rounds,
      challenge: s.challenge,
      names: [s.names[0], s.names[1]],
      mode: "online",
    };
  }

  private send(m: NetMsg): void {
    this.transport?.send(m);
  }

  private fail(e: unknown): void {
    this.error = e instanceof Error ? e.message : "CONNECTION FAILED";
    this.state = "error";
    this.deps.onUiChange();
  }

  private teardown(): void {
    this.transport?.close();
    this.transport = null;
    this.remote = null;
    this.role = null;
    this.state = "idle";
    this.peerId = null;
    this.guestJoined = false;
    this.started = false;
    this.remoteSettings = null;
    this.error = "";
  }
}
