import { describe, it, expect } from "vitest";
import { Rng } from "./rng";
import { genProblem, type Difficulty } from "./problems";

const DIFFS: Difficulty[] = ["squire", "knight", "champion"];

describe("genProblem", () => {
  it("produces valid, well-formed problems across difficulties", () => {
    const rng = new Rng(12345);
    for (const d of DIFFS) {
      for (let i = 0; i < 500; i++) {
        const p = genProblem(rng, d);

        // exactly 4 distinct choices
        expect(p.choices).toHaveLength(4);
        expect(new Set(p.choices).size).toBe(4);

        // correct index points at the answer
        expect(p.choices[p.correct]).toBe(p.answer);

        // arithmetic is right
        const expected = p.op === "+" ? p.a + p.b : p.op === "-" ? p.a - p.b : p.a * p.b;
        expect(p.answer).toBe(expected);

        // subtraction never goes negative; no negative choices
        if (p.op === "-") expect(p.answer).toBeGreaterThanOrEqual(0);
        for (const c of p.choices) expect(c).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("squire never multiplies", () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      expect(genProblem(rng, "squire").op).not.toBe("×");
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = genProblem(new Rng(99), "knight");
    const b = genProblem(new Rng(99), "knight");
    expect(a).toEqual(b);
  });
});
