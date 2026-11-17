// Progress and concept mastery (brief 3.3), kept in this browser only (no accounts yet).
// Mastery grows with correct reasoning on DIFFERENT scenes, not with points or speed: a
// concept is "secure" after correct answers on 4 different scenes, and a recent miss shows
// it as still "building". No timers, no leaderboards.
export const CONCEPTS = {
  roles:     { label: "Light roles", help: "Key, fill, back: what each light does." },
  fill:      { label: "Fill and mood", help: "How the fill light sets the shadow depth and mood." },
  styles:    { label: "High-key and low-key", help: "Bright and even, or dark and dramatic." },
  reading:   { label: "Reading a photo", help: "The three clues: shadows, background, brightest side." },
  softhard:  { label: "Soft and hard light", help: "Size and distance set how soft shadows are." },
  color:     { label: "Colour temperature", help: "Warm and cool light, and white balance." },
  modifiers: { label: "Modifiers", help: "Softboxes, umbrellas, snoots, gels, gobos, flags, barn doors." },
  exposure:  { label: "Exposure", help: "Aperture, shutter speed and ISO." },
};
const KEY = "lightlab.progress.v1", NEEDED = 4;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { events: [], lessons: {}, notes: {}, peeks: [] }; }
  catch (e) { return { events: [], lessons: {}, notes: {}, peeks: [] }; }
}
function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* storage blocked: progress lasts this visit only */ } }
let P = load();

export function record(concept, item, correct) {
  P.events.push({ c: concept, i: item, ok: !!correct, t: Date.now() });
  if (P.events.length > 500) P.events = P.events.slice(-500);
  save(P);
}
export function lessonDone(id) { P.lessons[id] = Date.now(); save(P); }
export const isLessonDone = (id) => !!P.lessons[id];
export function saveNote(id, text) { P.notes[id] = text; save(P); }
export const note = (id) => P.notes[id] || "";
export function recordPeek(id) { if (!P.peeks.includes(id)) P.peeks.push(id); save(P); }
export const peeked = (id) => P.peeks.includes(id);

export function mastery(concept) {
  const ev = P.events.filter((e) => e.c === concept);
  const distinct = new Set(ev.filter((e) => e.ok).map((e) => e.i)).size;
  const recent = ev.slice(-3), recentMiss = recent.some((e) => !e.ok);
  const level = Math.min(1, distinct / NEEDED);
  return { level, distinct, needed: NEEDED, tried: ev.length,
    word: !ev.length ? "not started" : level >= 1 && !recentMiss ? "secure" : distinct >= 2 ? "building" : "started" };
}
export function resetProgress() { P = { events: [], lessons: {}, notes: {}, peeks: [] }; save(P); }
