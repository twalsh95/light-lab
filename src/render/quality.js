// Quality ladder. No Chromebook was available to measure, so instead of guessing a level per
// device, the app measures itself:
//   1. On start-up it times a few frames at each level and picks the best that stays smooth.
//   2. While a light is being dragged, it watches the frame rate and steps down if it drops.
//   3. When the student stops, it draws one sharper still frame (a single slow frame is fine).
// Students can always choose a level themselves.
export const ORDER = ["low", "medium", "high"];
const INTERACTIVE_BUDGET_MS = 14;   // leaves room for the rest of the page at 60 fps
const STILL_BUDGET_MS = 250;        // one frame after the student lets go
const SLOW_FRAME_MS = 40;           // below about 25 fps while dragging = step down

export function createQuality(renderer, { onChange } = {}) {
  let choice = "auto";            // "auto" or a level name
  let auto = { interactive: "low", still: "medium" };
  let recent = [];

  const q = {
    get choice() { return choice; },
    get interactive() { return choice === "auto" ? auto.interactive : choice; },
    get still() { return choice === "auto" ? auto.still : choice; },
    get autoLevels() { return { ...auto }; },
    set(c) { choice = c; recent = []; onChange?.(q); },

    // Times each level on the current scene. Call once the page is showing.
    calibrate(state, cssSize) {
      if (renderer.kind !== "3d") return;
      const timeLevel = (level) => {
        renderer.render(state, level, cssSize, true);   // first frame includes shader setup
        const t = [];
        for (let i = 0; i < 4; i++) t.push(renderer.render(state, level, cssSize, true));
        t.sort((a, b) => a - b);
        return t[1];
      };
      const times = {};
      for (const level of ORDER) {
        times[level] = timeLevel(level);
        if (times[level] > STILL_BUDGET_MS) break;      // don't bother timing anything slower
      }
      const best = (budget) => ORDER.filter((l) => times[l] !== undefined && times[l] <= budget).pop() || "low";
      auto = { interactive: best(INTERACTIVE_BUDGET_MS), still: best(STILL_BUDGET_MS), times };
      onChange?.(q);
      return auto;
    },

    // Call with each frame's time while the scene is changing continuously.
    frame(dtMs) {
      if (choice !== "auto") return;
      recent.push(dtMs);
      if (recent.length < 15) return;
      const sorted = [...recent].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      recent = [];
      const i = ORDER.indexOf(auto.interactive);
      if (median > SLOW_FRAME_MS && i > 0) {
        auto.interactive = ORDER[i - 1];
        onChange?.(q);
      }
    },
    idle() { recent = []; },
  };
  return q;
}
