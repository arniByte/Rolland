import { ROOM_ALPHABET, ROOM_CODE_LEN } from "./constants";

/** A fresh, easy-to-read-aloud room code (no confusable glyphs). */
export function genRoomCode(): string {
  let s = "";
  for (let i = 0; i < ROOM_CODE_LEN; i++) {
    s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return s;
}

/** Clean up a typed code: uppercase, strip junk, clamp length. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LEN);
}
