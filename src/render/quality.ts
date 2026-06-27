// Render-quality switch (LOW / HIGH) shared by the post pass and the UI toggle.
// Auto-detects a sensible default from the device, persists a manual override,
// and exposes the reduced-motion preference.
export type Quality = "LOW" | "HIGH";

const KEY = "roland.quality";

function detect(): Quality {
  const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
  const small = typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 480;
  return cores <= 4 || small ? "LOW" : "HIGH";
}

let current: Quality = ((): Quality => {
  try {
    const s = localStorage.getItem(KEY);
    if (s === "LOW" || s === "HIGH") return s;
  } catch {
    /* storage blocked */
  }
  return detect();
})();

export function getQuality(): Quality {
  return current;
}

export function setQuality(q: Quality): void {
  current = q;
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* storage blocked */
  }
}

export function cycleQuality(): Quality {
  setQuality(current === "HIGH" ? "LOW" : "HIGH");
  return current;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
