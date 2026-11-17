// Light Lab browser tests: no install needed, open tests/index.html from a local server.
// Covers the scene model, undo, geometry, the gear list, and the physics the app must
// teach correctly (falloff, size -> softness, spot/flood, warm/cool, fill, reflectors).
import { loadGear, gear, fixture, modifier, inventoryProblems, cameras, cameraView, cameraGear } from "../src/scene/gear.js";
await loadGear();
const { PRESETS, normalize, serialize, parse, blankScene, makeLight, makeReflector, VERSION } = await import("../src/scene/schema.js");
const { createHistory } = await import("../src/scene/history.js");
const L = await import("../src/scene/lightmath.js");
const { createShaderRenderer, backdropBlur, grainFor } = await import("../src/render/shader.js");
const Cam = await import("../src/scene/camera.js");
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
await test("Auto keeps the lit side steady (to within the camera's third-stop steps)", () => {
  for (const d of [0.6, 1, 1.7, 3]) {
    const s = keyOnly({ distance: d });
    near(Cam.meterStops(L.cameraSettings(s), L.meterFace(s)), 0, 0.22, `at ${d} m`);
  }
});
await test("Manual with fixed settings: twice as far = 2 stops darker", () => {
  const m1 = keyOnly(), m2 = keyOnly({ distance: 2 });
  for (const m of [m1, m2]) Object.assign(m.camera, { mode: "manual", aperture: 8, shutter: 1 / 60, iso: 200 });
  near(Math.log2((L.exposureFor(m1) * L.meterFace(m1)) / (L.exposureFor(m2) * L.meterFace(m2))), 2, 0.01);
});
await test("exposure triangle: each setting changes brightness by the right number of stops", () => {
  const base = { aperture: 8, shutter: 1 / 60, iso: 200 }, e = Cam.exposureFromSettings;
  near(Math.log2(e({ ...base, shutter: 1 / 30 }) / e(base)), 1, 1e-9, "shutter twice as long");
  near(Math.log2(e({ ...base, iso: 400 }) / e(base)), 1, 1e-9, "ISO doubled");
  near(Math.log2(e({ ...base, aperture: 5.6 }) / e(base)), 1, 0.05, "one stop wider (f-numbers are rounded)");
});
await test("Auto picks real-world settings for the three-point preset (about f/5.6, a usable shutter, low ISO)", () => {
  const c = L.cameraSettings(PRESETS.threePoint.build());
  ok(c.aperture >= 2.8 && c.aperture <= 8 && c.shutter <= 1 / 15 && c.shutter >= 1 / 500 && c.iso <= 400, JSON.stringify(c));
});
await test("the meter reads 0 when Manual uses Auto's settings, and +1 a stop brighter", () => {
  const s = PRESETS.threePoint.build(), auto = L.cameraSettings(s), E = L.meterFace(s);
  near(Cam.meterStops(auto, E), 0, 0.2);
  near(Cam.meterStops({ ...auto, shutter: auto.shutter * 2 }, E) - Cam.meterStops(auto, E), 1, 1e-9);
});
await test("in a nearly dark studio, Auto has to raise ISO (and so adds grain)", () => {
  const c = L.cameraSettings(blankScene());
  ok(c.iso > 200 && grainFor(c.iso) > 0, JSON.stringify(c));
});
await test("a wide aperture blurs the backdrop much more than a small one, and more when it's farther back", () => {
  const s = keyOnly(); s.camera.mode = "manual"; s.backdrop.distance = 1;
  s.camera.aperture = 1.8; const wide = backdropBlur(s);
  s.camera.aperture = 8; const narrow = backdropBlur(s);
  s.backdrop.distance = 2.5; const far = backdropBlur(s);
  ok(wide > narrow * 4 && far > narrow, `${wide} ${narrow} ${far}`);
});
await test("no grain at ISO 100, clear grain by ISO 6400", () => { ok(grainFor(100) === 0 && grainFor(6400) > 0.06); });
await test("every lens fits a camera in the room, and every camera has a lens", () => {
  const C = cameras();
  for (const [k, l] of Object.entries(C.lenses)) ok(Object.values(C.bodies).some((b) => b.mount === l.mount), k);
  for (const [k, b] of Object.entries(C.bodies)) ok(Object.values(C.lenses).some((l) => l.mount === b.mount), k);
});
await test("a lens that doesn't fit the body is swapped for one that does", () => {
  const s = PRESETS.threePoint.build(); s.camera.body = "canon-t7"; s.camera.lens = "rokinon-85";
  const n = normalize(s); ok(cameras().lenses[n.camera.lens].mount === "canon-ef", n.camera.lens);
});
await test("a zoom's widest aperture narrows as it zooms in (18-55: f/3.5 to f/5.6)", () => {
  const lens = cameras().lenses["sony-dt-18-55"];
  ok(Cam.lensLimits(lens, 18).widest === 3.5 && Cam.lensLimits(lens, 55).widest === 5.6);
  ok(Cam.aperturesFor(lens, 55)[0] === 5.6 && Cam.aperturesFor(lens, 18).includes(4));
});
await test("longer lenses stand farther back for the same framing; an APS-C lens on a full-frame body crops", () => {
  const s = PRESETS.threePoint.build(); s.camera.body = "sony-a65"; s.camera.lens = "sony-dt-18-55";
  s.camera.focalMm = 18; const wide = cameraView(s).distance;
  s.camera.focalMm = 55; const tele = cameraView(s).distance;
  ok(tele > wide * 2.5, `${wide} ${tele}`);
  s.camera.body = "sony-a99ii"; ok(cameraGear(s).crop && cameraGear(s).sensorH < 16, "crop mode");
});
// Same framing means the camera steps back for the longer lens, so the gain is real but less
// than the focal-length ratio when the backdrop is close behind the subject.
await test("a longer lens blurs the backdrop more at the same aperture (same framing)", () => {
  const s = PRESETS.threePoint.build(); Object.assign(s.camera, { mode: "manual", aperture: 5.6, body: "sony-a65", lens: "sony-dt-55-300" });
  s.camera.focalMm = 55; const short = backdropBlur(s);
  s.camera.focalMm = 200; const long = backdropBlur(s);
  ok(long > short * 1.3, `${short} ${long}`);
});
await test("Auto can't change a manual lens's aperture: it keeps the ring setting and adjusts shutter and ISO", () => {
  const s = PRESETS.threePoint.build(); Object.assign(s.camera, { mode: "auto", body: "sony-a65", lens: "rokinon-85", focalMm: 85, aperture: 2 });
  const a = L.cameraSettings(s); ok(a.aperture === 2, "ring at T2: " + JSON.stringify(a));
  s.camera.aperture = 11; const b = L.cameraSettings(s); ok(b.aperture === 11 && b.shutter > a.shutter, "ring at T11: " + JSON.stringify(b));
  near(Cam.meterStops(b, L.meterFace(s)), 0, 0.22, "still correctly exposed");
  s.camera.lens = "rokinon-14"; s.camera.focalMm = 14; s.camera.aperture = 1.8; ok(L.cameraSettings(s).aperture === 3.1, "can't open past T3.1");
});
await test("cine lenses show T-stops", () => { ok(Cam.apertureLabel(1.5, true) === "T1.5" && Cam.apertureLabel(5.6) === "f/5.6"); });
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
await test("the 3D view's beam mask matches the portrait: a top barn door darkens the top of the beam", async () => {
  const { drawBeamMask, plainBeam } = await import("../src/render/beammask.js");
  const s = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", flood: 1, shutters: { top: 0.6, bottom: 0, camera: 0, backdrop: 0 } });
  const Lt = L.resolveLights(s)[0];
  ok(!plainBeam(Lt), "has a mask");
  const c = drawBeamMask(Lt, (2 * Lt.coneDeg * Math.PI) / 180, 64), d = c.getContext("2d").getImageData(0, 0, 64, 64).data;
  const at = (x, y) => d[(y * 64 + x) * 4];
  ok(at(32, 8) < 40 && at(32, 56) > 200, `top ${at(32, 8)}, bottom ${at(32, 56)}`);
});
await test("the snapshot PDF is a real one-page PDF", async () => {
  const portrait = document.createElement("canvas"); portrait.width = portrait.height = 64;
  const blob = await snapshotPdf(composeSnapshot(PRESETS.threePoint.build(), portrait));
  const text = new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
  ok(text.startsWith("%PDF-1.4") && text.trimEnd().endsWith("%%EOF") && /\/Count 1/.test(text), "structure");
  const xref = +text.match(/startxref\n(\d+)/)[1];
  ok(text.slice(xref, xref + 4) === "xref", "xref offset points at the table");
});

// ---------- Classifier test suite (brief section 5.3) ----------
const Mx = await import("../src/metrics/metrics.js");
const { classify } = await import("../src/metrics/classify.js");
const refMetrics = {};
for (const n of ["p1_key", "p2_keyfill", "p3_three", "p4_highkey", "p5_lowkey", "p6_trap", "p7_whitebg_lowkey"]) {
  // onload, not img.decode(): decode() can stall in a background (hidden) tab.
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("couldn't load " + n)); img.src = "../docs/light-lab-reference/" + n + ".jpg"; });
  refMetrics[n] = Mx.referenceMetrics(img);
}
await test("reference p4 is high-key", () => ok(classify(refMetrics.p4_highkey).id === "high-key", JSON.stringify(refMetrics.p4_highkey)));
await test("reference p5 is low-key", () => ok(classify(refMetrics.p5_lowkey).id === "low-key"));
await test("reference p3 is balanced three-point", () => ok(classify(refMetrics.p3_three).id === "balanced"));
await test("reference p6 (black backdrop) is balanced, NOT low-key", () => ok(classify(refMetrics.p6_trap).id === "balanced"));
await test("reference p7 (white backdrop, one-sided light) is low-key, labelled as dramatic light on a bright backdrop", () => {
  const c = classify(refMetrics.p7_whitebg_lowkey); ok(c.id === "low-key" && /bright backdrop/.test(c.note), JSON.stringify(c));
});
await test("references p1 and p2 are not high-key or low-key", () => {
  ok(classify(refMetrics.p1_key).id === "balanced" && classify(refMetrics.p2_keyfill).id === "balanced");
});
await test("every reference shows the key on picture-left (camera-left), as rendered", () => {
  for (const [n, m] of Object.entries(refMetrics)) ok(m.keySide === "left", n);
});
if (R) {
  const p6 = PRESETS.threePoint.build(); p6.backdrop = { type: "black", brightness: 0.03, distance: 1.8 };
  const p7 = PRESETS.lowKey.build(); p7.backdrop = { type: "white", brightness: 0.5, distance: 1.2 };
  p7.lights.push(makeLight({ id: "bg", role: "backdrop", fixture: "s45-rgb", power: 1, kelvin: 3200 }));
  for (const [name, s, want] of [["three-point preset", PRESETS.threePoint.build(), "balanced"], ["high-key preset", PRESETS.highKey.build(), "high-key"],
    ["low-key preset", PRESETS.lowKey.build(), "low-key"], ["three-point on black paper (p6-style)", p6, "balanced"], ["low-key on lit white paper (p7-style)", p7, "low-key"]]) {
    await test(`3D render: ${name} is ${want}`, () => { const m = R.measure(s); ok(classify(m).id === want, JSON.stringify(m)); });
  }
  await test("2D simple view classifies the presets the same way", () => {
    const c2 = createFallbackRenderer(document.createElement("canvas"));
    for (const [p, want] of [["threePoint", "balanced"], ["highKey", "high-key"], ["lowKey", "low-key"]]) ok(classify(c2.measure(PRESETS[p].build())).id === want, p);
  });
  await test("keySide follows the key: moving it camera-right flips the bright side", () => {
    const s = PRESETS.threePoint.build(); s.lights[0].azimuthDeg = 45; s.lights[1].azimuthDeg = -40;
    ok(R.measure(s).keySide === "right");
  });
  await test("rim score rises when the back light is on", () => {
    const a = PRESETS.threePoint.build(); a.lights[2].on = false;
    ok(R.measure(PRESETS.threePoint.build()).rimScore > R.measure(a).rimScore + 0.15);
  });
  await test("a warm halogen key reads as a warm colour cast at daylight white balance", () => {
    const s = keyOnly({ fixture: "fresnel-650", modifier: "fresnel-lens", distance: 2.5 });
    ok(R.measure(s).colorCast > 0.3, String(R.measure(s).colorCast));
  });
}

// ---------- Learning layer (content, checks, progress, description, vocabulary) ----------
const C = await import("../src/learn/content.js");
const { describe } = await import("../src/learn/describe.js");
const V = await import("../src/learn/vocab.js");
const Prog = await import("../src/learn/progress.js");
const { CLASSES } = await import("../src/metrics/classify.js");
const contentBase = new URL("../content/", location.href);
const contentIndex = await (await fetch(new URL("index.json", contentBase))).json();
const contentDocs = await Promise.all(contentIndex.files.map(async (f) => [f, await (await fetch(new URL(f, contentBase))).json()]));
const allItems = contentDocs.flatMap(([f, d]) => (d.items || [d]).map((it) => ({ file: f, type: d.type, ...it })));
const STEP_TYPES = ["text", "setup", "task", "choose", "predict", "reflect"];

await test("every content file loads and every item has an id and a status", () => {
  ok(allItems.length > 20, "only " + allItems.length);
  for (const it of allItems) ok(it.id && ["draft", "approved"].includes(it.status), `${it.file}: ${it.id} status ${it.status}`);
});
await test("content ids are unique within each type", () => {
  for (const t of ["lessons", "predict", "targets", "quizzes"]) {
    const ids = allItems.filter((i) => i.type === t).map((i) => i.id);
    ok(new Set(ids).size === ids.length, t);
  }
});
await test("every content scene builds into a valid scene (presets, light ids, reflectors)", () => {
  const scenes = [];
  for (const it of allItems) {
    for (const def of [it.scene, it.targetScene, ...(it.steps || []).map((s) => s.scene)]) if (def) scenes.push([it.id, def]);
    if (it.change) scenes.push([it.id + " change", { ...it.scene, ...it.change, lights: { ...(it.scene?.lights || {}), ...(it.change.lights || {}) } }]);
  }
  for (const [id, def] of scenes) {
    if (def.preset && def.preset !== "current") ok(PRESETS[def.preset], `${id}: unknown preset ${def.preset}`);
    for (const lid of Object.keys(def.lights || {})) {
      const base = (PRESETS[def.preset] || PRESETS.threePoint).build();
      ok(base.lights.some((l) => l.id === lid) || def.lights[lid].fixture, `${id}: light "${lid}" isn't in the preset and has no fixture`);
    }
    const s = C.buildScene(def);
    same(normalize(s), s, id);
  }
});
await test("lesson steps are known types, and checks/answers are well formed", () => {
  const metricKeys = Object.keys(R ? R.measure(PRESETS.threePoint.build()) : { shadowStops: 0, backdropMean: 0, rimScore: 0, keySide: 0, overallMean: 0, faceMean: 0, colorCast: 0, tintCast: 0 });
  for (const les of allItems.filter((i) => i.type === "lessons")) {
    ok(les.concept in Prog.CONCEPTS, les.id + " concept");
    for (const [n, s] of les.steps.entries()) {
      ok(STEP_TYPES.includes(s.type), `${les.id} step ${n}: ${s.type}`);
      if (s.options) ok(Number.isInteger(s.answer) && s.answer >= 0 && s.answer < s.options.length, `${les.id} step ${n} answer`);
      for (const c of s.check || []) {
        if (c.metric) ok(metricKeys.includes(c.metric), `${les.id}: unknown metric ${c.metric}`);
        if (c.class) ok(CLASSES[c.class] || Object.values(CLASSES).some((x) => x.id === c.class), `${les.id}: unknown class ${c.class}`);
      }
    }
  }
  for (const q of allItems.filter((i) => i.type === "predict")) {
    ok(q.concept in Prog.CONCEPTS, q.id); ok(q.answer >= 0 && q.answer < q.options.length, q.id); ok(q.change, q.id + " has no change");
  }
  for (const t of allItems.filter((i) => i.type === "targets")) ok(t.concept in Prog.CONCEPTS && t.metrics && t.hints?.length && t.careerConnection, t.id);
});
await test("checks: light on/off, settings, paths, counts and the meter", () => {
  const s = PRESETS.threePoint.build();
  ok(C.checkAll([{ light: "fill", on: true }, { count: "lightsOn", ">=": 3 }], s));
  ok(!C.checkAll([{ light: "fill", on: false }], s));
  ok(C.checkAll([{ light: "key", prop: "distance", "<": 5 }, { path: "camera.mode", in: ["auto", "manual"] }], s));
  ok(C.checkAll([{ light: "nonexistent", on: false }], s), "a missing light counts as off");
  ok(C.checkAll([{ meter: true, ">=": -0.5, "<=": 0.5 }], s), "Auto exposes correctly");
  ok(C.checkAll([{ metric: "shadowStops", ">": 1 }], s, { shadowStops: 2 }) && !C.checkAll([{ metric: "shadowStops", ">": 1 }], s, null));
  ok(C.checkAll([{ class: "low-key" }], s, null, { id: "low-key" }) && !C.checkAll([{ class: "low-key" }], s, null, { id: "balanced" }));
});
await test("applyPatch merges light changes, removes lights and keeps the original untouched", () => {
  const a = PRESETS.threePoint.build();
  const b = C.applyPatch(a, { remove: ["back"], lights: { fill: { on: false }, key: { shutters: { top: 0.3 } } } });
  ok(b.lights.length === a.lights.length - 1 && !b.lights.find((l) => l.id === "fill").on);
  ok(a.lights.find((l) => l.id === "fill").on, "original changed");
  ok(b.lights.find((l) => l.id === "key").shutters.top === 0.3);
});
// The questions' answers must be what the physics actually shows.
await test("predict: Manual camera, key twice as far: meter drops 2 stops (the stated answer)", () => {
  const q = allItems.find((i) => i.id === "p-key-far"), a = C.buildScene(q.scene), b = C.applyPatch(a, q.change);
  const m = (s) => Cam.meterStops(L.cameraSettings(s), L.meterFace(s));
  near(m(a) - m(b), 2, 0.25, "stops darker");
});
if (R) {
  const pq = (id) => { const q = allItems.find((i) => i.id === id), a = C.buildScene(q.scene); return [R.measure(a), R.measure(C.applyPatch(a, q.change))]; };
  await test("predict: turning the fill off makes the shadow side much darker", () => { const [a, b] = pq("p-fill-off"); ok(b.shadowStops > a.shadowStops + 0.7, `${a.shadowStops} -> ${b.shadowStops}`); });
  await test("predict: back light on raises the rim", () => { const [a, b] = pq("p-back-on"); ok(b.rimScore > a.rimScore + 0.1); });
  await test("predict: black backdrop is still balanced (backdrop is only a clue)", () => { const [, b] = pq("p-black-backdrop"); ok(classify(b).id === "balanced", JSON.stringify(b)); });
  await test("predict: gold reflector lifts and warms the shadow side", () => { const [a, b] = pq("p-gold-reflector"); ok(b.shadowStops < a.shadowStops && b.colorCast > a.colorCast, JSON.stringify([a, b])); });
  await test("predict: barn door on the backdrop side darkens the backdrop, not the face", () => {
    const [a, b] = pq("p-barn-door"); ok(b.backdropMean < a.backdropMean * 0.8 && b.faceMean > a.faceMean * 0.85, JSON.stringify([a, b]));
  });
  await test("Match the look: each target scored against itself is a full match", () => {
    for (const t of allItems.filter((i) => i.type === "targets")) {
      const m = R.measure(C.buildScene(t.targetScene)), m2 = R.measure(C.buildScene(t.targetScene));
      for (const [k, spec] of Object.entries(t.metrics)) ok(k === "keySide" ? m.keySide === m2.keySide : Math.abs(m[k] - m2[k]) <= spec.full, `${t.id} ${k}`);
    }
  });
  await test("Name the setup: every quiz scene gets a class, and the traps land where intended", () => {
    const got = Object.fromEntries(allItems.filter((i) => i.type === "quizzes").map((q) => [q.id, classify(R.measure(C.buildScene(q.scene))).id]));
    ok(Object.values(got).every(Boolean));
    ok(got["n-trap-black"] === "balanced" && got["n-trap-white"] === "low-key" && got["n-high-key"] === "high-key", JSON.stringify(got));
    ok(new Set(Object.values(got)).size === 3, "the quiz should use all three answers: " + JSON.stringify(got));
  });
}
await test("scene description names the lights and says when one is off", () => {
  const s = PRESETS.threePoint.build(); s.lights.find((l) => l.id === "fill").on = false;
  const d = describe(s, R ? R.measure(s) : null).join(" ");
  ok(/key/i.test(d) && /fill light is off/i.test(d), d);
  ok(/All the lights are off/.test(describe(C.applyPatch(s, { lights: { key: { on: false }, back: { on: false } } }), null).join(" ")));
});
await test("vocabulary: tips wrap a term's first use only, with a definition for screen readers", async () => {
  await V.loadVocab();
  const div = document.createElement("div");
  div.append(V.linkify("The key light is the main light; the key light sets the mood."));
  const tips = div.querySelectorAll(".term");
  ok(tips.length >= 1 && [...tips].filter((t) => /^key light/i.test(t.textContent)).length === 1, div.innerHTML.slice(0, 200));
  const t = tips[0]; ok(t.tabIndex === 0 && div.querySelector("#" + t.getAttribute("aria-describedby"))?.getAttribute("role") === "tooltip");
});
await test("mastery grows with different scenes, not repeats, and a recent miss holds it back", () => {
  const KEYP = "lightlab.progress.v1"; let saved = null;
  try { saved = localStorage.getItem(KEYP); } catch (e) { /* storage blocked */ }
  try {
    Prog.resetProgress();
    for (let i = 0; i < 5; i++) Prog.record("fill", "same-scene", true);
    ok(Prog.mastery("fill").distinct === 1 && Prog.mastery("fill").word === "started");
    for (const id of ["a", "b", "c"]) Prog.record("fill", id, true);
    ok(Prog.mastery("fill").word === "secure" && Prog.mastery("fill").level === 1);
    Prog.record("fill", "d", false);
    ok(Prog.mastery("fill").word === "building");
    ok(Prog.mastery("color").word === "not started");
  } finally {
    Prog.resetProgress();
    try { if (saved != null) localStorage.setItem(KEYP, saved); } catch (e) { /* storage blocked */ }
  }
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
