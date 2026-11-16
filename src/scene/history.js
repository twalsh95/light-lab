// Undo and redo. Each change can carry a "group" name: changes in the same group close
// together in time (a drag, a slider being moved, a held arrow key) become one undo step.
import { clone } from "./schema.js";

export function createHistory(initial, { limit = 100, groupMs = 700 } = {}) {
  let past = [], future = [], present = clone(initial);
  let lastGroup = null, lastTime = 0;
  const listeners = new Set();
  const emit = (why) => listeners.forEach((fn) => fn(present, why));

  return {
    get state() { return present; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // mutate(draft) changes a copy; the copy becomes the new state.
    change(mutate, group = null, now = Date.now()) {
      const next = clone(present);
      mutate(next);
      if (JSON.stringify(next) === JSON.stringify(present)) return;
      const merge = group && group === lastGroup && now - lastTime < groupMs;
      if (!merge) {
        past.push(present);
        if (past.length > limit) past.shift();
      }
      future = [];
      present = next;
      lastGroup = group; lastTime = now;
      emit("change");
    },
    // Replace everything (a preset, an opened file). Undoable.
    replace(next) {
      past.push(present); if (past.length > limit) past.shift();
      future = []; present = clone(next); lastGroup = null;
      emit("replace");
    },
    endGroup() { lastGroup = null; },
    undo() {
      if (!past.length) return;
      future.push(present); present = past.pop(); lastGroup = null;
      emit("undo");
    },
    redo() {
      if (!future.length) return;
      past.push(present); present = future.pop(); lastGroup = null;
      emit("redo");
    },
  };
}
