// Net-transport tunables (the gameplay-timing constants — SETTLE_MS_ONLINE and
// the reaction clamps — live in game/engine.ts so the pure game stays
// self-contained; the Trystero-specific constants live in trysteroTransport.ts so
// they only ever land in the lazy online chunk).

/** Room codes: 4 chars, no confusable glyphs (no O/0, I/1/L). ~500k space. */
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LEN = 4;

/** A 3rd peer is turned away — the duel is strictly 1-on-1. */
export const MAX_PEERS = 1;

/**
 * Heartbeat: Trystero peer-leave events can lag, so we ping and treat a peer as
 * gone if it falls silent. Plenty of margin over the ~per-frame snapshot rate.
 */
export const PING_MS = 2000;
export const PEER_TIMEOUT_MS = 8000;

/** A guest that never finds a live host in this long gives up (visible error). */
export const CONNECT_TIMEOUT_MS = 15000;
