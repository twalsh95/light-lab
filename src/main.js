// Light Lab: start-up and wiring. No sign-in, no network: everything happens in the browser.
import { PRESETS, normalize, serialize, parse, ROLES } from "./scene/schema.js";
import { createHistory } from "./scene/history.js";
import { createShaderRenderer } from "./render/shader.js";
import { createFallbackRenderer } from "./render/fallback2d.js";
import { createQuality } from "./render/quality.js";
import { createMap } from "./ui/map.js";
import { createPanels } from "./ui/panels.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "lightlab.scene.v1";
const NOTICE_KEY = "lightlab.noticeSeen.v1";

// ---------- Messages (plain language; school devices have no developer tools) ----------
function showError(msg) { const e = $("error"); e.textContent = msg; e.hidden = false; }
function announce(msg) { $("status").textContent = msg; }
window.addEventListener("error", (e) => showError("Something went wrong: " + (e.message || "unknown error") + ". Try Reset, or reload the page."));
window.addEventListener("unhandledrejection", (e) => showError("Something went wrong: " + (e.reason?.message || e.reason) + ". Try Reset, or reload the page."));

// Browser storage can be blocked or full; Light Lab works without it.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* not available: fine */ } },
};

// ---------- State ----------
let initial;
try { initial = store.get(SAVE_KEY) ? parse(store.get(SAVE_KEY)) : PRESETS.threePoint.build(); }
catch (e) { initial = PRESETS.threePoint.build(); }
const history = createHistory(initial);

// ---------- Renderer ----------
const view = $("view");
let canvas = $("portrait");
let renderer;
function useFallback(reason) {
  const fresh = document.createElement("canvas");
  fresh.id = "portrait"; fresh.className = canvas.className;
  fresh.setAttribute("role", "img");
  canvas.replaceWith(fresh); canvas = fresh;
  renderer = createFallbackRenderer(canvas);
  $("qualityRow").hidden = true;
  showError(reason + " Switching to the simple view: same lights, fewer details.");
}
// ?view=simple opens the 2D view on purpose (for a slow device, or to compare).
const wantSimple = new URLSearchParams(location.search).get("view") === "simple";
try {
  if (wantSimple) { renderer = createFallbackRenderer(canvas); $("qualityRow").hidden = true; }
  else renderer = createShaderRenderer(canvas);
} catch (e) { useFallback(e.message); }

const quality = createQuality(renderer, { onChange: (q) => {
  const a = q.autoLevels;
  $("qualityNote").textContent = q.choice === "auto" ? `Auto: ${a.interactive} while moving, ${a.still} when still.` : "";
} });

const cssSize = () => Math.max(160, Math.round(view.clientWidth));
let dirty = true, stillPending = false, lastChange = 0, lastFrame = performance.now(), wasDirty = false;

function frame(now) {
  const dt = now - lastFrame; lastFrame = now;
  try {
    if (renderer.lost) useFallback("The 3D view stopped working on this device.");
    const s = history.state;
    if (dirty) {
      if (wasDirty) quality.frame(dt);
      renderer.render(s, quality.interactive, cssSize());
      dirty = false; wasDirty = true; stillPending = true;
    } else {
      wasDirty = false;
      if (stillPending && now - lastChange > 250) {
        if (quality.still !== quality.interactive) renderer.render(s, quality.still, cssSize());
        stillPending = false;
        quality.idle();
      }
    }
  } catch (e) {
    if (renderer.kind === "3d") useFallback("The 3D view couldn't keep running (" + e.message + ").");
    else { showError("The studio view couldn't be drawn: " + e.message); return; }
  }
  requestAnimationFrame(frame);
}

// ---------- UI ----------
const panels = createPanels({ inspectorEl: $("inspector"), backdropEl: $("backdrop"), cameraEl: $("camera") }, history);
const map = createMap($("map"), {
  onMove: (id, { azimuthDeg, distance }, group) => history.change((s) => {
    const l = s.lights.find((x) => x.id === id);
    l.azimuthDeg = Math.round(azimuthDeg);
    l.distance = Math.round(Math.min(4, Math.max(0.4, distance)) * 100) / 100;
  }, group),
  onPower: (id, delta, group) => history.change((s) => {
    const l = s.lights.find((x) => x.id === id);
    l.power = Math.round(Math.min(1, Math.max(0, l.power + delta)) * 100) / 100;
    l.on = true;
  }, group),
  onToggle: (id) => history.change((s) => { const l = s.lights.find((x) => x.id === id); l.on = !l.on; }),
  onSelect: (id) => { if (panels.selected !== id) { panels.select(id); refresh(); } },
  onEndGroup: () => history.endGroup(),
});

function refresh() {
  const s = history.state;
  panels.update(s);
  map.update(s, panels.selected);
  $("undo").disabled = !history.canUndo();
  $("redo").disabled = !history.canRedo();
  canvas.setAttribute("aria-label", "Portrait of the clay head under the current lights");
}

let saveTimer = null;
history.subscribe((s, why) => {
  dirty = true; lastChange = performance.now();
  refresh();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(SAVE_KEY, serialize(s)), 400);
  if (why === "undo") announce("Undone.");
  if (why === "redo") announce("Redone.");
});

// Presets
for (const [key, p] of Object.entries(PRESETS)) {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = p.label; b.className = "preset";
  b.addEventListener("click", () => { history.replace(p.build()); announce(`${p.label} preset. Undo goes back to your setup.`); });
  $("presets").append(b);
}
$("undo").addEventListener("click", () => history.undo());
$("redo").addEventListener("click", () => history.redo());
$("reset").addEventListener("click", () => { history.replace(PRESETS.threePoint.build()); announce("Reset to the three-point setup. Undo brings your setup back."); });

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" && (t.type === "number" || t.type === "text"))) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
  else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); history.redo(); }
});

// Quality
$("quality").addEventListener("change", () => { quality.set($("quality").value); dirty = true; });

// Save PNG: draw one sharp frame, then save it.
$("savePng").addEventListener("click", () => {
  renderer.render(history.state, "high", cssSize());
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "light-lab-portrait.png";
  a.click();
  dirty = true;
  announce("Saved the portrait as a PNG.");
});
// Setup files: download and open. These hold only the lighting settings.
$("saveSetup").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([serialize(history.state)], { type: "application/json" }));
  a.download = "light-lab-setup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  announce("Saved the setup file.");
});
$("openSetup").addEventListener("click", () => $("openFile").click());
$("openFile").addEventListener("change", async () => {
  const f = $("openFile").files[0];
  $("openFile").value = "";
  if (!f) return;
  try {
    history.replace(parse(await f.text()));
    announce("Opened " + f.name + ".");
  } catch (e) { showError(e.message); }
});

// First visit: what this app saves.
if (!store.get(NOTICE_KEY)) $("notice").hidden = false;
$("noticeOk").addEventListener("click", () => { $("notice").hidden = true; store.set(NOTICE_KEY, "1"); });

// ---------- Go ----------
refresh();
requestAnimationFrame(() => {
  try {
    if (renderer.kind === "3d") quality.calibrate(history.state, cssSize());
  } catch (e) { useFallback(e.message); }
  dirty = true;
  requestAnimationFrame(frame);
});
window.addEventListener("resize", () => { dirty = true; });

export { history, ROLES };   // handy for the browser tests
