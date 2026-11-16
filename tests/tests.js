// Light Lab browser tests: no install needed, open tests/index.html from a local server.
// Phase 2 covers the scene model (round trips, cleaning bad input), undo/redo, light
// geometry, and the physics the app must teach correctly (falloff, size -> softness).
import { PRESETS, normalize, serialize, parse, blankScene, VERSION } from "../src/scene/schema.js";
import { createHistory } from "../src/scene/history.js";
import { lightPosition, mapPoint, fromMapPoint, irradianceAt, exposureFor, meterFace } from "../src/scene/lightmath.js";
import { createShaderRenderer } from "../src/render/shader.js";
import { createFallbackRenderer } from "../src/render/fallback2d.js";

const results = [];
function test(name, fn) {
  try { fn(); results.push([name, true]); }
  catch (e) { results.push([name, false, e.message]); }
}
const ok = (c, msg) => { if (!c) throw new Error(msg || "expected true"); };
const near = (a, b, tol, msg) => { if (Math.abs(a - b) > tol) throw new Error(`${msg || ""} expected ${b} ± ${tol}, got ${a}`); };
const same = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(msg || `${x} !== ${y}`); };

// ---------- Scene serialization ----------
test("every preset survives save then open unchanged", () => {
  for (const [k, p] of Object.entries(PRESETS)) same(parse(serialize(p.build())), p.build(), k);
});
test("normalize is stable (normalizing twice changes nothing)", () => {
  for (const p of Object.values(PRESETS)) { const a = normalize(p.build()); same(normalize(a), a); }
});
test("junk input becomes the blank studio", () => {
  same(normalize(null), blankScene()); same(normalize("hello"), blankScene()); same(normalize({}), blankScene());
});
test("out-of-range values are clamped, unknown fields dropped", () => {
  const s = PRESETS.threePoint.build();
  s.lights[0].power = 7; s.lights[0].distance = -3; s.lights[0].hack = "x"; s.backdrop.brightness = 2; s.extra = 1;
  const n = normalize(s);
  ok(n.lights[0].power === 1, "power"); ok(n.lights[0].distance === 0.4, "distance");
  ok(!("hack" in n.lights[0]) && !("extra" in n), "unknown fields");
  ok(n.backdrop.brightness <= 0.95, "brightness");
});
test("a file from a newer version is refused with a plain message", () => {
  let msg = "";
  try { normalize({ version: VERSION + 1, lights: [] }); } catch (e) { msg = e.message; }
  ok(/newer version/.test(msg), msg);
});
test("a non-setup file is refused with a plain message", () => {
  let msg = "";
  try { parse("{\"name\": \"not a setup\"}"); } catch (e) { msg = e.message; }
  ok(/isn't a Light Lab setup/.test(msg), msg);
});
test("scene files never contain names, emails or ids of people", () => {
  const text = serialize(PRESETS.threePoint.build());
  ok(!/email|name|uid|user/i.test(text), "unexpected personal field");
});

// ---------- Undo / redo ----------
test("undo and redo step through changes", () => {
  const h = createHistory(PRESETS.threePoint.build());
  h.change((s) => { s.lights[0].power = 0.5; });
  h.change((s) => { s.lights[1].on = false; });
  h.undo(); ok(h.state.lights[1].on === true && h.state.lights[0].power === 0.5);
  h.undo(); ok(h.state.lights[0].power === 1);
  h.redo(); h.redo(); ok(h.state.lights[1].on === false);
  ok(!h.canRedo());
});
test("a drag is one undo step", () => {
  const h = createHistory(PRESETS.threePoint.build());
  for (let i = 0; i < 20; i++) h.change((s) => { s.lights[0].azimuthDeg = -45 + i; }, "drag-key", 1000 + i * 16);
  h.endGroup();
  ok(h.state.lights[0].azimuthDeg === -26);
  h.undo(); ok(h.state.lights[0].azimuthDeg === -45, "one undo returns to the start");
});
test("a new change clears redo", () => {
  const h = createHistory(PRESETS.threePoint.build());
  h.change((s) => { s.lights[0].power = 0.5; }); h.undo();
  h.change((s) => { s.lights[0].power = 0.2; });
  ok(!h.canRedo());
});
test("changes that change nothing don't add undo steps", () => {
  const h = createHistory(PRESETS.threePoint.build());
  h.change(() => {}); ok(!h.canUndo());
});

// ---------- Geometry ----------
test("azimuth -90 is camera-left (negative x), 0 is toward the camera", () => {
  const l = { azimuthDeg: -90, elevationDeg: 0, distance: 2 };
  const p = lightPosition(l); near(p[0], -2, 1e-9); near(p[2], 0, 1e-9);
  const q = lightPosition({ azimuthDeg: 0, elevationDeg: 0, distance: 2 }); near(q[2], 2, 1e-9);
});
test("dragging on the map round-trips to the same light position", () => {
  for (const az of [-150, -45, 0, 30, 140]) for (const el of [0, 30, 60]) {
    const l = { azimuthDeg: az, elevationDeg: el, distance: 1.7 };
    const { x, z } = mapPoint(l);
    const r = fromMapPoint(l, x, z);
    near(r.azimuthDeg, az, 1e-6, "azimuth"); near(r.distance, 1.7, 1e-6, "distance");
  }
});

// ---------- Physics the app must teach correctly ----------
const keyOnly = () => {
  const s = PRESETS.threePoint.build();
  s.lights[1].on = false; s.lights[2].on = false; s.room.ambient = 0;
  Object.assign(s.lights[0], { azimuthDeg: 0, elevationDeg: 0, distance: 1 });
  return s;
};
test("inverse-square: twice as far = a quarter of the light", () => {
  const a = keyOnly(), b = keyOnly(); b.lights[0].distance = 2;
  const Ea = irradianceAt(a, [0, 0, 0], [0, 0, 1]), Eb = irradianceAt(b, [0, 0, 0], [0, 0, 1]);
  near(Eb / Ea, 0.25, 1e-9);
});
test("angle of incidence: a surface turned 60° away gets half the light", () => {
  const s = keyOnly();
  const E0 = irradianceAt(s, [0, 0, 0], [0, 0, 1]);
  const E60 = irradianceAt(s, [0, 0, 0], [Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)]);
  near(E60 / E0, 0.5, 1e-9);
});
test("auto exposure keeps the lit side the same however far the key goes", () => {
  const a = keyOnly(), b = keyOnly(); b.lights[0].distance = 3;
  near(exposureFor(a) * meterFace(a), exposureFor(b) * meterFace(b), 1e-9);
});
test("with auto exposure off, moving the key twice as far darkens the face 2 stops", () => {
  const a = keyOnly(), b = keyOnly(); a.camera.autoExposure = b.camera.autoExposure = false; b.lights[0].distance = 2;
  near(Math.log2(meterFace(a) / meterFace(b)), 2, 0.01);
});
test("a dark studio stays dark (auto exposure doesn't brighten nothing into grey)", () => {
  const s = blankScene();
  ok(exposureFor(s) * meterFace(s) < 0.8 * 0.2, "blank studio should render dark");
});

// ---------- Rendered checks (3D view) ----------
function renderStats(renderer, s, size = 192) {
  renderer.render(s, "high", size / (window.devicePixelRatio || 1));
  return renderer;
}
let shaderRenderer = null, shaderCanvas = null;
try { shaderCanvas = document.createElement("canvas"); shaderRenderer = createShaderRenderer(shaderCanvas); } catch (e) { /* reported below */ }
test("the 3D view starts on this device", () => ok(shaderRenderer, "WebGL 2 not available"));

function pixels(canvas) {
  const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext("2d"); g.drawImage(canvas, 0, 0);
  return { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}
// Mean brightness (0..1) of a box given as fractions of the frame.
function boxMean({ data, w, h }, x0, y0, x1, y1) {
  let s = 0, n = 0;
  for (let y = Math.floor(y0 * h); y < y1 * h; y++) for (let x = Math.floor(x0 * w); x < x1 * w; x++) {
    const o = (y * w + x) * 4; s += (data[o] + data[o + 1] + data[o + 2]) / 765; n++;
  }
  return s / n;
}
// Face boxes: the cheek on each side of the nose, and a backdrop patch.
const LIT = [0.33, 0.42, 0.42, 0.5], SHADOW = [0.58, 0.42, 0.67, 0.5], BACKDROP = [0.04, 0.05, 0.16, 0.2];
const stops = (s) => { renderStats(shaderRenderer, s); const p = pixels(shaderCanvas); return Math.log2((boxMean(p, ...LIT) + 1e-3) / (boxMean(p, ...SHADOW) + 1e-3)); };
const backdropOf = (s) => { renderStats(shaderRenderer, s); return boxMean(pixels(shaderCanvas), ...BACKDROP); };

if (shaderRenderer) {
  test("low-key has a much deeper shadow side than high-key", () => {
    const lo = stops(PRESETS.lowKey.build()), hi = stops(PRESETS.highKey.build());
    ok(lo > hi + 1.5, `low-key ${lo.toFixed(2)} stops vs high-key ${hi.toFixed(2)} stops`);
  });
  test("the fill light lifts the shadow side without removing it", () => {
    const a = PRESETS.threePoint.build(); a.lights[1].on = false;
    const b = PRESETS.threePoint.build();
    const sa = stops(a), sb = stops(b);
    ok(sb < sa, `with fill ${sb.toFixed(2)} should be below without ${sa.toFixed(2)}`);
    ok(sb > 0.2, `shadow side still darker with fill (${sb.toFixed(2)} stops)`);
  });
  test("high-key backdrop is bright, low-key backdrop is dark", () => {
    ok(backdropOf(PRESETS.highKey.build()) > 0.8, "high-key backdrop");
    ok(backdropOf(PRESETS.lowKey.build()) < 0.08, "low-key backdrop");
  });
  test("a bigger key light gives a softer shadow edge (penumbra)", () => {
    // Measure how gradually the face goes from lit to shadow across the nose shadow.
    const edgeWidth = (size) => {
      const s = keyOnly(); s.lights[0].azimuthDeg = -60; s.lights[0].elevationDeg = 10; s.lights[0].size = size;
      renderStats(shaderRenderer, s, 256);
      const { data, w, h } = pixels(shaderCanvas);
      const y = Math.round(h * 0.47), row = [];
      for (let x = Math.round(w * 0.45); x < Math.round(w * 0.62); x++) { const o = (y * w + x) * 4; row.push(data[o + 1] / 255); }
      const hi = Math.max(...row), lo = Math.min(...row), a = lo + 0.1 * (hi - lo), b = lo + 0.9 * (hi - lo);
      return row.filter((v) => v > a && v < b).length;     // pixels in the transition
    };
    const hard = edgeWidth(0.05), soft = edgeWidth(1.2);
    ok(soft > hard, `soft edge ${soft}px should be wider than hard edge ${hard}px`);
  });
}

// ---------- Report ----------
const list = document.getElementById("list");
let failed = 0;
for (const [name, pass, msg] of results) {
  const li = document.createElement("li");
  li.className = pass ? "pass" : "fail";
  li.textContent = (pass ? "✓ " : "✗ ") + name + (msg ? " — " + msg : "");
  list.append(li);
  if (!pass) failed++;
}
document.getElementById("summary").textContent = `${results.length - failed} passed, ${failed} failed.`;
document.title = `Light Lab tests: ${failed ? failed + " failed" : "all passed"}`;
window.__results = results;

// ---------- Visual sheet: references vs 3D vs 2D ----------
(async () => {
  const looks = [["p3_three.jpg", PRESETS.threePoint], ["p4_highkey.jpg", PRESETS.highKey], ["p5_lowkey.jpg", PRESETS.lowKey]];
  const S = 240, out = document.createElement("canvas");
  out.width = S * looks.length; out.height = S * 3;
  const g = out.getContext("2d");
  const fb = document.createElement("canvas"), fallback = createFallbackRenderer(fb);
  for (let i = 0; i < looks.length; i++) {
    const [ref, preset] = looks[i];
    const img = new Image(); img.src = "../docs/light-lab-reference/" + ref; await img.decode();
    g.drawImage(img, i * S, 0, S, S);
    if (shaderRenderer) { shaderRenderer.render(preset.build(), "high", S); g.drawImage(shaderCanvas, i * S, S, S, S); }
    fallback.render(preset.build(), "low", S); g.drawImage(fb, i * S, 2 * S, S, S);
  }
  out.style.width = "100%";
  document.getElementById("sheet").append(out);
  window.__sheetReady = true;
})();
