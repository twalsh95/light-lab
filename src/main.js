// Light Lab: start-up and wiring. No sign-in, no network beyond loading the app's own files.
import { loadGear } from "./scene/gear.js";

const $ = (id) => document.getElementById(id);
const SAVE_KEY = "lightlab.scene";
const NOTICE_KEY = "lightlab.noticeSeen.v1";

function showError(msg) { const e = $("error"); e.textContent = msg; e.hidden = false; }
function announce(msg) { $("status").textContent = ""; setTimeout(() => { $("status").textContent = msg; }, 30); }
window.addEventListener("error", (e) => showError("Something went wrong: " + (e.message || "unknown error") + ". Try Reset, or reload the page."));
window.addEventListener("unhandledrejection", (e) => showError("Something went wrong: " + (e.reason?.message || e.reason) + ". Try Reset, or reload the page."));

// Browser storage can be blocked or full; Light Lab works without it.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* not available: fine */ } },
};

try { await loadGear(); }
catch (e) { showError("Light Lab couldn't load its gear list. Check the internet connection and reload. (" + e.message + ")"); throw e; }

const { PRESETS, serialize, parse } = await import("./scene/schema.js");
const { createHistory } = await import("./scene/history.js");
const { createShaderRenderer } = await import("./render/shader.js");
const { createFallbackRenderer } = await import("./render/fallback2d.js");
const { createQuality } = await import("./render/quality.js");
const { createMap } = await import("./ui/map.js");
const { createPanels } = await import("./ui/panels.js");
const { composeSnapshot, snapshotPdf } = await import("./ui/snapshot.js");
const { createChips } = await import("./ui/chips.js");
const { createSideView } = await import("./ui/sideview.js");

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
  fresh.id = "portrait"; fresh.className = canvas.className; fresh.setAttribute("role", "img");
  canvas.replaceWith(fresh); canvas = fresh;
  renderer = createFallbackRenderer(canvas);
  $("qualityRow").hidden = true;
  showError(reason + " Switching to the simple view: same lights, fewer details (no gobos).");
}
const wantSimple = new URLSearchParams(location.search).get("view") === "simple";
try {
  if (wantSimple) { renderer = createFallbackRenderer(canvas); $("qualityRow").hidden = true; }
  else renderer = createShaderRenderer(canvas);
} catch (e) { useFallback(e.message); }

const quality = createQuality(renderer, { onChange: (q) => {
  const a = q.autoLevels;
  $("qualityNote").textContent = q.choice === "auto" ? `Auto: ${a.interactive} while moving, ${a.still} when still.` : "";
  $("quality").title = $("qualityNote").textContent;
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
        stillPending = false; quality.idle();
      }
    }
  } catch (e) {
    if (renderer.kind === "3d") useFallback("The 3D view couldn't keep running (" + e.message + ").");
    else { showError("The studio view couldn't be drawn: " + e.message); return; }
  }
  requestAnimationFrame(frame);
}

// ---------- UI ----------
function select(id) { if (panels.selected !== id) { panels.select(id); refresh(); } }
const panels = createPanels({ studio: $("studio"), inspector: $("inspector"), subject: $("subject"), backdrop: $("backdrop"), camera: $("camera") },
  history, { onSelect: (id) => { panels.select(id); refresh(); if (id) requestAnimationFrame(() => map.focus(id)); }, announce });
const findAny = (s, id) => s.lights.find((x) => x.id === id) || s.reflectors.find((x) => x.id === id);
const map = createMap($("map"), {
  onMove: (id, { azimuthDeg, distance }, group) => history.change((s) => {
    const o = findAny(s, id);
    o.azimuthDeg = Math.round(azimuthDeg);
    o.distance = Math.round(Math.min(4, Math.max(0.4, distance)) * 100) / 100;
  }, group),
  onPower: (id, delta, group) => history.change((s) => {
    const l = s.lights.find((x) => x.id === id);
    l.power = Math.round(Math.min(1, Math.max(0, l.power + delta)) * 100) / 100; l.on = true;
  }, group),
  onToggle: toggleLight,
  onSelect: select,
  onEndGroup: () => history.endGroup(),
  onRemove: (id) => {
    history.change((s) => { s.lights = s.lights.filter((x) => x.id !== id); s.reflectors = s.reflectors.filter((x) => x.id !== id); });
    announce("Removed. Undo brings it back.");
  },
});

function toggleLight(id) { history.change((s) => { const l = s.lights.find((x) => x.id === id); if (l) l.on = !l.on; }); }
const chips = createChips($("chips"), { onSelect: (id) => { select(id); map.focus(id); }, onToggle: toggleLight });
const side = createSideView($("sideview"), {
  onChange: (id, { elevationDeg, distance }, group) => history.change((s) => { const o = findAny(s, id); o.elevationDeg = elevationDeg; o.distance = distance; }, group),
  onEndGroup: () => history.endGroup(),
});

// The studio card: top-down map or the 3D studio. The 3D view (and three.js) loads only
// the first time someone opens it.
const VIEW_KEY = "lightlab.studioView";
let studio3d = null, studioView = "map";
async function setStudioView(v) {
  if (v === "3d" && !studio3d) {
    $("studio3d").hidden = false;
    $("studio3d").setAttribute("aria-busy", "true");
    try {
      const { createStudio3D } = await import("./ui/studio3d.js");
      studio3d = await createStudio3D($("studio3d"), {
        onSelect: (id) => select(id),
        // Dragging in 3D sets the same three controls as the map and side view.
        onMove: (id, { azimuthDeg, elevationDeg, distance }, group) => history.change((s) => {
          const o = findAny(s, id);
          if (o) Object.assign(o, { azimuthDeg, elevationDeg, distance });
        }, group),
        onEndGroup: () => history.endGroup(),
      });
    } catch (e) {
      $("studio3d").hidden = true;
      showError("The 3D studio view couldn't open on this device (" + e.message + "). The map from above still works.");
      v = "map";
    } finally { $("studio3d").removeAttribute("aria-busy"); }
  }
  studioView = v;
  $("map").hidden = v !== "map";
  $("studio3d").hidden = v !== "3d";
  for (const b of document.querySelectorAll("#viewToggle [data-view]")) b.setAttribute("aria-checked", b.dataset.view === v ? "true" : "false");
  store.set(VIEW_KEY, v);
  refresh();
}
for (const b of document.querySelectorAll("#viewToggle [data-view]")) b.addEventListener("click", () => setStudioView(b.dataset.view));

// Our room / Open studio, in the header.
for (const b of document.querySelectorAll("#modeToggle [data-mode]")) {
  b.addEventListener("click", () => {
    const mode = b.dataset.mode;
    if (history.state.mode === mode) return;
    history.change((s) => { s.mode = mode; if (mode === "room") s.lights.forEach((l) => { l.sizeOverride = null; }); });
    announce(mode === "room" ? "Our room: only the gear we really have." : "Open studio: any gear, any amount, any light size.");
  });
}
// The Save menu closes when you pick something, click elsewhere, or press Escape.
const saveMenu = $("saveMenu");
saveMenu.addEventListener("click", (e) => { if (e.target.closest(".menu-items button")) saveMenu.open = false; });
document.addEventListener("click", (e) => { if (saveMenu.open && !saveMenu.contains(e.target)) saveMenu.open = false; });
saveMenu.addEventListener("keydown", (e) => { if (e.key === "Escape" && saveMenu.open) { saveMenu.open = false; saveMenu.querySelector("summary").focus(); } });

function refresh() {
  const s = history.state;
  panels.update(s);
  map.update(s, panels.selected);
  chips.update(s, panels.selected);
  side.update(s, panels.selected);
  if (studio3d && studioView === "3d") studio3d.update(s, panels.selected);
  for (const b of document.querySelectorAll("#modeToggle [data-mode]")) b.setAttribute("aria-checked", b.dataset.mode === s.mode ? "true" : "false");
  $("undo").disabled = !history.canUndo();
  $("redo").disabled = !history.canRedo();
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

// Presets keep the current mode.
for (const [key, p] of Object.entries(PRESETS)) {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = p.label; b.className = "preset";
  b.addEventListener("click", () => {
    const next = p.build(), mode = history.state.mode;
    next.mode = mode;
    history.replace(next);
    panels.select(next.lights[0]?.id || null); refresh();
    announce(`${p.label} preset. Undo goes back to your setup.`);
  });
  $("presets").append(b);
}
$("undo").addEventListener("click", () => history.undo());
$("redo").addEventListener("click", () => history.redo());
$("reset").addEventListener("click", () => { history.replace(PRESETS.threePoint.build()); panels.select("key"); refresh(); announce("Reset to the three-point setup. Undo brings your setup back."); });

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const t = e.target;
  if (t && t.tagName === "INPUT" && (t.type === "number" || t.type === "text")) return;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
  else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); history.redo(); }
});
$("quality").addEventListener("change", () => { quality.set($("quality").value); dirty = true; });

// ---------- Saving ----------
function download(href, name) {
  const a = document.createElement("a"); a.href = href; a.download = name; a.click();
  if (href.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(href), 2000);
}
function sharpPortrait() {
  renderer.render(history.state, "high", Math.max(cssSize(), 640));
  const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
  c.getContext("2d").drawImage(canvas, 0, 0);
  dirty = true;
  return c;
}
$("savePng").addEventListener("click", () => {
  download(composeSnapshot(history.state, sharpPortrait()).toDataURL("image/png"), "light-lab-snapshot.png");
  announce("Saved the snapshot as a PNG: portrait, diagram and settings.");
});
$("savePdf").addEventListener("click", async () => {
  const blob = await snapshotPdf(composeSnapshot(history.state, sharpPortrait()));
  download(URL.createObjectURL(blob), "light-lab-snapshot.pdf");
  announce("Saved the snapshot as a one-page PDF.");
});
$("saveSetup").addEventListener("click", () => {
  download(URL.createObjectURL(new Blob([serialize(history.state)], { type: "application/json" })), "light-lab-setup.json");
  announce("Saved the setup file.");
});
$("openSetup").addEventListener("click", () => $("openFile").click());
$("openFile").addEventListener("change", async () => {
  const f = $("openFile").files[0];
  $("openFile").value = "";
  if (!f) return;
  try { const s = parse(await f.text()); history.replace(s); panels.select(s.lights[0]?.id || null); refresh(); announce("Opened " + f.name + "."); }
  catch (e) { showError(e.message); }
});

if (!store.get(NOTICE_KEY)) $("notice").hidden = false;
$("noticeOk").addEventListener("click", () => { $("notice").hidden = true; store.set(NOTICE_KEY, "1"); });

// ---------- Go ----------
panels.select(history.state.lights[0]?.id || null);
refresh();
if (store.get(VIEW_KEY) === "3d") setStudioView("3d");
requestAnimationFrame(() => {
  try { if (renderer.kind === "3d") quality.calibrate(history.state, cssSize()); }
  catch (e) { useFallback(e.message); }
  dirty = true;
  requestAnimationFrame(frame);
});
window.addEventListener("resize", () => { dirty = true; });

export { history, panels };
export const getStudio3d = () => studio3d;   // for the tests
