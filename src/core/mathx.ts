export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

/** Re-map v from [inMin,inMax] to [outMin,outMax], clamped to the output range. */
export const remap = (
  v: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number => {
  const t = clamp(invLerp(inMin, inMax, v), 0, 1);
  return lerp(outMin, outMax, t);
};

export const round = (v: number): number => Math.round(v);

/** frame-rate independent exponential smoothing toward a target */
export const damp = (current: number, target: number, lambda: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));
