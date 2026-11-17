// Light Lab browser tests: no install needed, open tests/index.html from a local server.
// Covers the scene model, undo, geometry, the gear list, and the physics the app must
// teach correctly (falloff, size -> softness, spot/flood, warm/cool, fill, reflectors).
import { loadGear, gear, fixture, modifier, inventoryProblems } from "../src/scene/gear.js";
await loadGear();
const { PRESETS, normalize, serialize, parse, blankScene, makeLight, makeReflector, VERSION } = await import("../src/scene/schema.js");
const { createHistory } = await import("../src/scene/history.js");
const L = await import("../src/scene/lightmath.js");
const { createShaderRenderer } = await import("../src/render/shader.js");
const { createFallbackRenderer } = await import("../src/render/fallback2d.js");
const { composeSnapshot, snapshotPdf } = await import("../src/ui/snapshot.js");

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, true]); }
  catch (e) { results.push([name, false, e.message]); }
}
const ok = (c, msg) => { if (!c) throw new Error(msg || "expected true"); };
const near = (a, b, tol, msg) => { if (Math.abs(a - b) > tol) throw new Error(`${msg || ""} expected ${b} ± ${tol}, got ${a}`); };
const same = (a, b, msg) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(msg || `${x.slice(0, 200)} !== ${y.slice(0, 200)}`); };

// One light straight in front of the face, nothing else (Open studio, any-size light).
function keyOnly(o = {}) {
  const s = blankScene(); s.mode = "open"; s.room.ambient = 0;
  s.lights = [makeLight({ id: "key", role: "key", fixture: "studio-light", modifier: "any-size", power: 1, azimuthDeg: 0, elevationDeg: 0, distance: 1, ...o })];
  return s;
}
const faceE = (s, n = [0, 0, 1]) => L.irradianceAt(s, [0, 0, 0], n);

// ---------- Scene files ----------
await test("every preset survives save then open unchanged", () => {
  for (const [k, p] of Object.entries(PRESETS)) same(parse(serialize(p.build())), p.build(), k);
});
await test("normalize is stable (cleaning twice changes nothing)", () => {
  for (const p of Object.values(PRESETS)) { const a = normalize(p.build()); same(normalize(a), a); }
});
await test("junk input becomes the blank studio", () => { same(normalize(null), blankScene()); same(normalize("hi"), blankScene()); });
await test("out-of-range values are clamped, unknown fields and fixtures dropped", () => {
  const s = PRESETS.threePoint.build();
  s.lights[0].power = 7; s.lights[0].distance = -3; s.lights[0].hack = "x"; s.extra = 1;
  s.lights.push({ id: "z", fixture: "laser-cannon" });
  const n = normalize(s);
  ok(n.lights[0].power === 1 && n.lights[0].distance === 0.4, "clamped");
  ok(!("hack" in n.lights[0]) && !("extra" in n), "unknown fields");
  ok(n.lights.length === 3, "unknown fixture dropped");
});
await test("a modifier that doesn't fit the fixture falls back to its default", () => {
  const s = PRESETS.threePoint.build(); s.lights[1].modifier = "snoot";   // D50 panel can't take a snoot
  ok(normalize(s).lights[1].modifier === "panel-bare");
});
await test("a Phase 2 (version 1) setup file still opens, as any-size lights in Open studio", () => {
  const v1 = { version: 1, camera: { autoExposure: true, evCompensation: 0 }, backdrop: { brightness: 0.4, distance: 1.1, light: { on: true, power: 0.5 } },
    room: { ambient: 0.01 }, lights: [{ id: "key", role: "key", on: true, power: 1, azimuthDeg: -45, elevationDeg: 30, distance: 1.5, size: 0.6 },
      { id: "fill", role: "fill", on: false, power: 0.3, azimuthDeg: 40, elevationDeg: 5, distance: 1.8, size: 1 }] };
  const s = normalize(v1);
  ok(s.version === VERSION && s.mode === "open", "upgraded");
  ok(s.lights.length === 3 && s.lights[0].fixture === "studio-light" && s.lights[0].sizeOverride === 0.6, "lights kept");
  ok(s.backdrop.type === "custom" && s.backdrop.brightness === 0.4, "backdrop kept");
});
await test("a file from a newer version is refused with a plain message", () => {
  let msg = ""; try { normalize({ version: VERSION + 1, lights: [] }); } catch (e) { msg = e.message; }
  ok(/newer version/.test(msg), msg);
});
await test("a non-setup file is refused with a plain message", () => {
  let msg = ""; try { parse("{\"name\": \"x\"}"); } catch (e) { msg = e.message; }
  ok(/isn't a Light Lab setup/.test(msg), msg);
});
await test("setup files never contain names, emails or account ids", () => {
  ok(!/email|"name"|uid|user/i.test(serialize(PRESETS.threePoint.build())));
});

// ---------- Undo ----------
await test("undo and redo step through changes; a drag is one step", () => {
  const h = createHistory(PRESETS.threePoint.build());
  for (let i = 0; i < 20; i++) h.change((s) => { s.lights[0].azimuthDeg = -45 + i; }, "drag", 1000 + i * 16);
  h.endGroup();
  h.change((s) => { s.lights[1].on = false; });
  h.undo(); ok(h.state.lights[1].on && h.state.lights[0].azimuthDeg === -26);
  h.undo(); ok(h.state.lights[0].azimuthDeg === -45);
  h.redo(); h.redo(); ok(!h.state.lights[1].on && !h.canRedo());
});

// ---------- Geometry ----------
await test("azimuth -90 is camera-left; map drag round-trips", () => {
  const p = L.lightPosition({ azimuthDeg: -90, elevationDeg: 0, distance: 2 }); near(p[0], -2, 1e-9);
  for (const az of [-150, -45, 30, 140]) for (const el of [0, 40]) {
    const l = { azimuthDeg: az, elevationDeg: el, distance: 1.7 }, { x, z } = L.mapPoint(l), r = L.fromMapPoint(l, x, z);
    near(r.azimuthDeg, az, 1e-6); near(r.distance, 1.7, 1e-6);
  }
});

// ---------- Gear ----------
await test("every preset uses only gear the room really has", () => {
  for (const [k, p] of Object.entries(PRESETS)) { const s = p.build(); s.mode = "room"; same(inventoryProblems(s), [], k); }
});
await test("Room mode notices a third CB60 (the room has two)", () => {
  const s = PRESETS.threePoint.build();
  s.lights.push(makeLight({ id: "x", fixture: "cb60-rgb" }));
  ok(inventoryProblems(s).some((p) => /CB60/.test(p)), JSON.stringify(inventoryProblems(s)));
  s.mode = "open"; same(inventoryProblems(s), []);
});
await test("every gobo in the gear list has a pattern in the 3D view", () => {
  for (const g of Object.keys(gear().gobos)) {
    const s = keyOnly({ fixture: "cb60-rgb", modifier: "gobo", gobo: g });
    ok(L.resolveLights(s)[0].gobo > 0, g);
  }
});
await test("Switti S45 RGB uses its published specs", () => {
  const f = fixture("s45-rgb");
  ok(f.luxAt1m === 2050 && f.kelvin[0] === 2600 && f.kelvin[1] === 10000 && f.rgb && f.dimmable);
});
await test("gear list is consistent: default modifiers fit, every fixture has a source", () => {
  for (const [id, f] of Object.entries(gear().fixtures)) {
    ok(f.modifiers.includes(f.defaultModifier), id + " default modifier");
    f.modifiers.forEach((m) => ok(modifier(m), id + " unknown modifier " + m));
    ok(f.source, id + " source");
  }
});

// ---------- Physics ----------
await test("inverse-square: twice as far = a quarter of the light", () => near(faceE(keyOnly({ distance: 2 })) / faceE(keyOnly()), 0.25, 1e-9));
await test("angle of incidence: a surface turned 60° away gets half the light", () => {
  near(faceE(keyOnly(), [Math.sin(Math.PI / 3), 0, 0.5]) / faceE(keyOnly()), 0.5, 1e-9);
});
await test("auto exposure keeps the lit side steady; manual shows 2 stops for double distance", () => {
  const a = keyOnly(), b = keyOnly({ distance: 3 });
  near(L.exposureFor(a) * L.meterFace(a), L.exposureFor(b) * L.meterFace(b), 1e-9);
  const m1 = keyOnly(), m2 = keyOnly({ distance: 2 }); m1.camera.autoExposure = m2.camera.autoExposure = false;
  near(Math.log2(L.meterFace(m1) / L.meterFace(m2)), 2, 0.01);
});
await test("a dark studio stays dark", () => { const s = blankScene(); ok(L.exposureFor(s) * L.meterFace(s) < 0.16); });
await test("a softbox is a bigger (softer) light than the CB60's bare reflector", () => {
  const s = keyOnly(), a = makeLight({ fixture: "cb60-rgb", modifier: "cb60-softbox" }), b = makeLight({ fixture: "cb60-rgb", modifier: "cb60-reflector" });
  ok(L.lightSpec(a, s).size > L.lightSpec(b, s).size * 2);
});
await test("Fresnel: spot is narrower and brighter on its axis than flood", () => {
  const s = keyOnly(), spot = L.lightSpec(makeLight({ fixture: "fresnel-650", flood: 0 }), s), flood = L.lightSpec(makeLight({ fixture: "fresnel-650", flood: 1 }), s);
  ok(spot.coneDeg < flood.coneDeg && spot.lux > flood.lux * 3, `${spot.coneDeg} ${flood.coneDeg} ${spot.lux} ${flood.lux}`);
});
await test("halogen looks orange at daylight white balance, neutral at tungsten", () => {
  const s = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens" });
  const c = L.resolveLights(s)[0].color;
  s.camera.whiteBalance = "daylight"; const d = L.whiteBalanceGain(s).map((g, i) => g * c[i]);
  s.camera.whiteBalance = "tungsten"; const t = L.whiteBalanceGain(s).map((g, i) => g * c[i]);
  ok(d[0] / d[2] > 1.8, "daylight: red/blue " + (d[0] / d[2]).toFixed(2));
  near(t[0] / t[2], 1, 0.05, "tungsten: red/blue");
});
await test("a cool LED (6500 K) looks blue at tungsten white balance", () => {
  const s = keyOnly({ fixture: "cb60-rgb", modifier: "cb60-reflector", kelvin: 6500 }); s.camera.whiteBalance = "tungsten";
  const c = L.resolveLights(s)[0].color, g = L.whiteBalanceGain(s);
  ok(c[2] * g[2] > c[0] * g[0] * 1.5);
});
await test("a red gel on the snoot makes red light", () => {
  const s = keyOnly({ fixture: "cb60-rgb", modifier: "snoot", gel: "red" });
  const c = L.resolveLights(s)[0].color; ok(c[0] > 4 * c[1] && c[0] > 4 * c[2]);
});
await test("a reflector on the shadow side lifts the shadow side", () => {
  const s = keyOnly({ azimuthDeg: -60 }), shadowSide = [Math.sin(Math.PI / 3), 0, 0.5];
  const before = faceE(s, shadowSide);
  s.reflectors.push(makeReflector({ item: "flag-black-white", side: "white", azimuthDeg: 60, distance: 0.7 }));
  ok(faceE(s, shadowSide) > before * 1.5, `${before} -> ${faceE(s, shadowSide)}`);
});
await test("a barn door folded in cuts the light off that side", () => {
  const s = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", flood: 1, azimuthDeg: -60 });
  const Lt = L.resolveLights(s)[0];
  ok(L.shutterFactor(Lt, [0, 0, 0]) === 1, "face lit");
  s.lights[0].shutters.top = 0.9; ok(L.shutterFactor(L.resolveLights(s)[0], [0, 0, 0]) === 0, "top door blocks the face");
});
await test("a beam is at half brightness at its published beam angle, and spills a little past it", () => {
  const s = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", flood: 0 }), Lt = L.resolveLights(s)[0];
  const at = (deg) => { const a = deg * Math.PI / 180; return L.coneFactor(Lt, [Math.sin(a), 0, -Math.cos(a)]); };
  near(at(Lt.coneDeg), 0.5, 0.01, "at the beam angle");
  ok(at(Lt.coneDeg * 1.3) > 0.05 && at(Lt.coneDeg * 2.1) === 0, "spill, then nothing");
});
await test("aiming a light at the backdrop lights the paper, not the face", () => {
  const narrow = { fixture: "cb60-rgb", modifier: "snoot", azimuthDeg: -60, distance: 1.5 };
  const face = keyOnly(narrow), paper = keyOnly({ ...narrow, aim: { at: "backdrop", panDeg: 0, tiltDeg: 0 } });
  face.backdrop.distance = paper.backdrop.distance = 1.2;
  const spot = [0, -0.05, -1.2], n = [0, 0, 1];
  ok(L.irradianceAt(paper, spot, n) > L.irradianceAt(face, spot, n) * 1.5, "backdrop brighter");
  ok(faceE(paper, [-0.5, 0, 0.87]) < faceE(face, [-0.5, 0, 0.87]), "face dimmer");
});
await test("turning a light (feathering) moves its beam off the face", () => {
  const a = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", flood: 0, distance: 2 });
  const b = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", flood: 0, distance: 2, aim: { at: "face", panDeg: 10, tiltDeg: 0 } });
  ok(faceE(b) < faceE(a) * 0.5, `${faceE(b)} vs ${faceE(a)}`);
});
await test("a light behind the backdrop paper can't light the subject, and says so", () => {
  const s = keyOnly({ azimuthDeg: 180, distance: 1.5 }); s.backdrop.distance = 1.0;
  ok(L.resolveLights(s).length === 0, "blocked");
  ok(L.sceneWarnings(s).some((w) => /behind the backdrop/.test(w)), "warning");
});
await test("halogen Fresnels have no dimmer in Room mode", () => {
  const s = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", power: 0.2 });
  const open = L.lightSpec(s.lights[0], s).intensity; s.mode = "room";
  ok(L.lightSpec(s.lights[0], s).intensity > open * 4);
});

// ---------- Rendered checks ----------
let R = null, cv = null;
await test("the 3D view starts on this device", () => { cv = document.createElement("canvas"); R = createShaderRenderer(cv); });
function pixels(canvas) {
  const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext("2d"); g.drawImage(canvas, 0, 0);
  return { data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}
function boxMean({ data, w, h }, x0, y0, x1, y1, ch = -1) {
  let s = 0, n = 0;
  for (let y = Math.floor(y0 * h); y < y1 * h; y++) for (let x = Math.floor(x0 * w); x < x1 * w; x++) {
    const o = (y * w + x) * 4; s += ch < 0 ? (data[o] + data[o + 1] + data[o + 2]) / 765 : data[o + ch] / 255; n++;
  }
  return s / n;
}
const LIT = [0.33, 0.42, 0.42, 0.5], SHADOW = [0.58, 0.42, 0.67, 0.5], BACKDROP = [0.04, 0.05, 0.16, 0.2];
const shot = (s, size = 192) => { R.render(s, "high", size / (window.devicePixelRatio || 1)); return pixels(cv); };
const stops = (s) => { const p = shot(s); return Math.log2((boxMean(p, ...LIT) + 1e-3) / (boxMean(p, ...SHADOW) + 1e-3)); };
if (R) {
  await test("low-key has a much deeper shadow side than high-key", () => {
    const lo = stops(PRESETS.lowKey.build()), hi = stops(PRESETS.highKey.build());
    ok(lo > hi + 1.5, `low-key ${lo.toFixed(2)} vs high-key ${hi.toFixed(2)} stops`);
  });
  await test("the fill light lifts the shadow side without removing it", () => {
    const a = PRESETS.threePoint.build(); a.lights[1].on = false;
    const sa = stops(a), sb = stops(PRESETS.threePoint.build());
    ok(sb < sa && sb > 0.2, `without ${sa.toFixed(2)}, with ${sb.toFixed(2)}`);
  });
  await test("high-key backdrop is bright, low-key backdrop is dark", () => {
    ok(boxMean(shot(PRESETS.highKey.build()), ...BACKDROP) > 0.8, "high-key");
    ok(boxMean(shot(PRESETS.lowKey.build()), ...BACKDROP) < 0.08, "low-key");
  });
  await test("a bigger key light gives a softer shadow edge", () => {
    const edge = (size) => {
      const { data, w, h } = shot(keyOnly({ azimuthDeg: -60, elevationDeg: 10, sizeOverride: size }), 256);
      const y = Math.round(h * 0.47), row = [];
      for (let x = Math.round(w * 0.45); x < Math.round(w * 0.62); x++) row.push(data[(y * w + x) * 4 + 1] / 255);
      const hi = Math.max(...row), lo = Math.min(...row);
      return row.filter((v) => v > lo + 0.1 * (hi - lo) && v < lo + 0.9 * (hi - lo)).length;
    };
    const hard = edge(0.05), soft = edge(1.2);
    ok(soft > hard, `soft ${soft}px vs hard ${hard}px`);
  });
  await test("darker skin presets render darker under the same light", () => {
    const face = (skin) => { const s = keyOnly(); s.subject.skin = skin; return boxMean(shot(s), ...LIT); };
    const light = face("light"), deep = face("deep");
    ok(light > deep * 2, `light ${light.toFixed(2)} vs deep ${deep.toFixed(2)}`);
  });
  await test("a warm halogen key looks orange on screen at daylight white balance", () => {
    const s = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", distance: 2.5 });
    const p = shot(s); ok(boxMean(p, ...LIT, 0) > boxMean(p, ...LIT, 2) * 1.4);
  });
}
await test("the simple 2D view draws every preset without errors", () => {
  const c = document.createElement("canvas"), f = createFallbackRenderer(c);
  for (const p of Object.values(PRESETS)) f.render(p.build(), "low", 128);
});
await test("the 3D studio view draws every fixture, modifier and reflector without errors", async () => {
  const { createStudio3D } = await import("../src/ui/studio3d.js");
  const box = document.createElement("div"); box.style.width = "300px"; document.body.append(box);
  const v = await createStudio3D(box, { onSelect() {} });
  for (const p of Object.values(PRESETS)) v.update(p.build(), null);
  const s = blankScene(); s.mode = "open";
  for (const [fid, f] of Object.entries(gear().fixtures)) for (const m of f.modifiers) {
    s.lights = [makeLight({ id: "x", fixture: fid, modifier: m, shutters: { top: 0.5, bottom: 0, camera: 0.3, backdrop: 0 } })];
    s.reflectors = [makeReflector({ item: "flag-gold-silver", side: "gold" })];
    v.update(s, "x");
  }
  v.dispose(); box.remove();
});
await test("the snapshot PDF is a real one-page PDF", async () => {
  const portrait = document.createElement("canvas"); portrait.width = portrait.height = 64;
  const blob = await snapshotPdf(composeSnapshot(PRESETS.threePoint.build(), portrait));
  const text = new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
  ok(text.startsWith("%PDF-1.4") && text.trimEnd().endsWith("%%EOF") && /\/Count 1/.test(text), "structure");
  const xref = +text.match(/startxref\n(\d+)/)[1];
  ok(text.slice(xref, xref + 4) === "xref", "xref offset points at the table");
});

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
const looks = [["p3_three.jpg", PRESETS.threePoint], ["p4_highkey.jpg", PRESETS.highKey], ["p5_lowkey.jpg", PRESETS.lowKey]];
const S = 240, out = document.createElement("canvas");
out.width = S * looks.length; out.height = S * 3;
const g = out.getContext("2d");
const fb = document.createElement("canvas"), fallback = createFallbackRenderer(fb);
for (let i = 0; i < looks.length; i++) {
  const [ref, preset] = looks[i];
  const img = new Image(); img.src = "../docs/light-lab-reference/" + ref; await img.decode();
  g.drawImage(img, i * S, 0, S, S);
  if (R) { R.render(preset.build(), "high", S); g.drawImage(cv, i * S, S, S, S); }
  fallback.render(preset.build(), "low", S); g.drawImage(fb, i * S, 2 * S, S, S);
}
out.style.width = "100%";
document.getElementById("sheet").append(out);
window.__sheetReady = true;
