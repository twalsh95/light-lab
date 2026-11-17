// 3D studio view: the set as you'd see it walking into the room. The subject, backdrop,
// floor, the camera on its tripod, and every light on its stand, drawn as what it is
// (softbox, umbrella, Fresnel with barn doors, panel, snoot...), with a faint beam.
//
// Drag to walk around the set, scroll or pinch to zoom, arrow keys and + / - with the
// keyboard. Click a light to select it. Moving lights stays on the map and side view.
//
// three.js loads only when this view is first opened (it isn't needed for the portrait).
import { HEAD, UNIT, featureHeight } from "../scene/head.js";
import { ROLES } from "../scene/schema.js";
import { fixture, modifier, reflectorItem } from "../scene/gear.js";
import { resolveLights, lightPosition, backdropLightPosition, materials, lightSpec, sub, add, norm, scale } from "../scene/lightmath.js";

const FLOOR = -1.45;                         // face height above the floor, in metres
const ROLE_COLORS = { key: "#f2a93b", fill: "#6cb4ec", back: "#ff7a72", hair: "#f08cd0", accent: "#7bd88f", backdrop: "#c9cdd6", reflector: "#e2b54a" };

export async function createStudio3D(container, { onSelect, onMove = () => {}, onEndGroup = () => {} }) {
  const THREE = await import("../../vendor/three/build/three.module.js");
  const canvas = document.createElement("canvas");
  canvas.className = "studio3d";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "3D view of the studio. Arrow keys look around; plus and minus zoom; Home resets the view. With a mouse or touch: drag a light to move it, Shift-drag to raise or lower it, drag empty space to look around.");
  container.appendChild(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); }
  catch (e) { canvas.remove(); throw new Error("This device can't draw the 3D studio view."); }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#121318");
  const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 50);
  const view = { yaw: 0.2, pitch: 0.62, radius: 5.6, target: new THREE.Vector3(0, -0.4, -0.25) };

  // Room light so the gear is always visible; the studio lights add their own on top.
  scene.add(new THREE.HemisphereLight(0xdfe6f0, 0x30323a, 0.9));
  const fillRoom = new THREE.DirectionalLight(0xffffff, 0.5);
  fillRoom.position.set(2, 4, 3);
  scene.add(fillRoom);

  // Floor with a 1 m grid.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR;
  scene.add(floor);
  const grid = new THREE.GridHelper(14, 14, 0x3d414b, 0x33363f);
  grid.position.y = FLOOR + 0.002;
  scene.add(grid);

  // Backdrop: a sheet of seamless paper falling to the floor and curving forward.
  // Front side only: from behind, the paper is see-through, so "From behind" shows the set.
  const backdropMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.FrontSide });
  const backdrop = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.9), backdropMat);
  sheet.position.y = FLOOR + 1.45 + 0.3;
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), backdropMat);
  sweep.rotation.x = -Math.PI / 2; sweep.position.set(0, FLOOR + 0.004, 0.45);
  backdrop.add(sheet, sweep);
  for (const x of [-1.65, 1.65]) backdrop.add(stand(THREE, x, FLOOR, 0, 3.3, 0x55585f));
  scene.add(backdrop);

  // Subject: the clay head and shoulders on a stool-height body.
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xbdb8b2, roughness: 0.55 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xbdb8b2, roughness: 0.8 });
  const subject = new THREE.Group();
  subject.add(ellipsoid(THREE, HEAD.head, true, skinMat), ellipsoid(THREE, HEAD.neck, false, skinMat), ellipsoid(THREE, HEAD.shoulders, false, clothMat));
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.75, 24), clothMat);
  torso.position.y = -0.3 - 0.37;
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, FLOOR * -1 - 1.05, 16), new THREE.MeshStandardMaterial({ color: 0x45484f }));
  stool.position.y = (-1.05 + FLOOR) / 2;
  subject.add(torso, stool);
  scene.add(subject);

  // The camera, on a tripod, where the portrait is taken from.
  const camGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.09), new THREE.MeshStandardMaterial({ color: 0x1c1d21, roughness: 0.5 }));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.12, 20), new THREE.MeshStandardMaterial({ color: 0x0e0f12 }));
  lens.rotation.x = Math.PI / 2; lens.position.z = -0.09;
  camGroup.add(body, lens);
  camGroup.position.set(0, -0.03, 2.2);
  scene.add(camGroup, stand(THREE, 0, FLOOR, 2.2, 1.42 - 0.05, 0x2f3137));
  scene.add(label(THREE, "Camera", "#b8bcc6", 0, 0.18, 2.2, 0.36));

  // Studio lights that actually light the subject in this view (so it looks lit).
  const lightPool = [];
  const lightsGroup = new THREE.Group();
  scene.add(lightsGroup);
  let gearSig = "", state = null, selected = null, size = 0;
  const pickables = [];

  function rebuildGear(s) {
    lightsGroup.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) { m.map?.dispose(); m.dispose(); } });
    lightsGroup.clear();
    pickables.length = 0;
    lightPool.forEach((l) => { scene.remove(l, l.target); l.dispose?.(); });
    lightPool.length = 0;
    let bg = 0;
    for (const l of s.lights) {
      const isBg = l.role === "backdrop";
      const p = isBg ? backdropLightPosition(s, bg++) : lightPosition(l);
      const target = isBg ? [0, -0.05, -s.backdrop.distance] : [0, 0, 0];
      const g = fixtureModel(THREE, l, s, p, target);
      g.userData.id = l.id;
      // The stand and a disc on the floor belong to the light: grab any part of it.
      g.add(stand(THREE, p[0], FLOOR, p[2], p[1] - FLOOR - 0.08, 0x3a3d45), floorDisc(THREE, p, ROLE_COLORS[l.role] || "#ffffff", isBg));
      lightsGroup.add(g);
      pickables.push(g);
      const sl = new THREE.SpotLight(0xffffff, 0, 0, Math.PI / 3, 0.5, 2);
      sl.position.set(...p); sl.target.position.set(...target);
      scene.add(sl, sl.target);
      lightPool.push(sl);
    }
    for (const r of s.reflectors) {
      const p = lightPosition(r), item = reflectorItem(r.item);
      const lit = resolveLights(s).filter((x) => x.role !== "backdrop" && x.role !== "reflector");
      const strongest = lit.sort((a, b) => b.intensity / dist2(b.position, p) - a.intensity / dist2(a.position, p))[0];
      const toSubject = norm(scale(p, -1));
      const n = strongest ? norm(add(norm(sub(strongest.position, p)), toSubject)) : toSubject;
      const color = { gold: 0xd9a63a, silver: 0xd6d9df, white: 0xf2f2f2 }[r.side] || 0xf2f2f2;
      const card = new THREE.Mesh(new THREE.PlaneGeometry(item.width, item.height), new THREE.MeshStandardMaterial({ color, roughness: r.side === "white" ? 0.9 : 0.35, metalness: r.side === "white" ? 0 : 0.6, side: THREE.DoubleSide }));
      const cardGroup = new THREE.Group();
      cardGroup.add(card);
      cardGroup.position.set(...p);
      cardGroup.lookAt(p[0] + n[0], p[1] + n[1], p[2] + n[2]);
      const g = new THREE.Group();
      g.userData.id = r.id;
      g.add(cardGroup, stand(THREE, p[0], FLOOR, p[2], p[1] - FLOOR - item.height / 2, 0x3a3d45),
        label(THREE, "R", ROLE_COLORS.reflector, p[0], p[1] + item.height / 2 + 0.15, p[2], 0.22, true),
        floorDisc(THREE, p, ROLE_COLORS.reflector, false));
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), new THREE.MeshBasicMaterial({ color: ROLE_COLORS.reflector, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p[0], FLOOR + 0.012, p[2]);
      ring.userData.selRing = true; ring.userData.noPick = true; ring.visible = false;
      g.add(ring);
      lightsGroup.add(g);
      pickables.push(g);
    }
  }

  function updateGear(s) {
    // Light the subject and backdrop roughly as the studio does (not exact: this is a
    // view of the set, not the portrait).
    const resolved = resolveLights(s).filter((x) => x.role !== "reflector");
    const maxE = Math.max(1e-6, ...resolved.map((L) => L.intensity / Math.max(0.2, dist2(L.position, L.target))));
    resolved.forEach((L, i) => {
      const sl = lightPool[s.lights.findIndex((x) => x.id === L.id)];
      if (!sl) return;
      sl.color.setRGB(...L.color, THREE.LinearSRGBColorSpace);
      sl.intensity = (L.intensity / maxE) * dist2(L.position, L.target) * 6;
      sl.angle = Math.min(Math.PI / 2.2, (L.coneDeg * Math.PI) / 180);
    });
    s.lights.forEach((l, i) => { if (!l.on && lightPool[i]) lightPool[i].intensity = 0; });
    const mat = materials(s);
    backdropMat.color.setRGB(...mat.backdrop, THREE.LinearSRGBColorSpace);
    backdrop.position.z = -s.backdrop.distance;
    skinMat.color.setRGB(...mat.skin, THREE.LinearSRGBColorSpace);
    clothMat.color.setRGB(...mat.clothing, THREE.LinearSRGBColorSpace);
    // Selected light: a ring on the floor around its stand.
    for (const g of pickables) {
      const sel = g.userData.id === selected;
      g.traverse((o) => { if (o.userData.selRing) o.visible = sel; });
    }
  }

  function render() {
    const w = container.clientWidth || 300, h = Math.round(w * 0.92);
    if (w !== size) { renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(w, h, false); canvas.style.width = "100%"; canvas.style.height = "auto"; cam.aspect = w / h; cam.updateProjectionMatrix(); size = w; }
    const { yaw, pitch, radius, target } = view;
    cam.position.set(target.x + radius * Math.sin(yaw) * Math.cos(pitch), target.y + radius * Math.sin(pitch), target.z + radius * Math.cos(yaw) * Math.cos(pitch));
    cam.lookAt(target);
    renderer.render(scene, cam);
  }

  // ----- Looking around, and moving lights -----
  // Drag empty space: walk around the set. Drag a light or reflector: slide it across the
  // floor at the same height. Shift-drag a light: raise or lower it. Two fingers: zoom.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pointers = new Map();
  let drag = null, pinch = null;
  const findObj = (id) => state && (state.lights.find((l) => l.id === id) || state.reflectors.find((r) => r.id === id));
  const movable = (o) => o && o.role !== "backdrop";

  function setRay(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
  }
  let lastHitPoint = null;
  function hitId(e) {
    setRay(e);
    const hit = ray.intersectObjects(pickables, true).find((h) => !h.object.userData.noPick && h.object.visible);
    lastHitPoint = hit?.point || null;
    let o = hit?.object;
    while (o && !o.userData.id) o = o.parent;
    return o?.userData.id || null;
  }
  // Where the pointer meets the horizontal plane at height y (scene coordinates).
  function onPlane(e, y) {
    setRay(e);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, out) ? out : null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    if (pointers.size === 2) {                       // second finger: start pinching
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: view.radius };
      drag = null;
      return;
    }
    const id = hitId(e), o = findObj(id);
    if (id) onSelect(id);
    if (movable(o)) {
      // Track the light's base across the floor from wherever it was grabbed, so it
      // doesn't jump: remember the gap between the grab point and the stand.
      // Slide along a level plane through the exact point that was grabbed (head, pole or
      // floor disc), so that point stays under the cursor.
      const lp = lightPosition(o), planeY = lastHitPoint ? lastHitPoint.y : FLOOR, hit = onPlane(e, planeY);
      drag = { mode: e.shiftKey ? "lift" : "move", id, x: e.clientX, y: e.clientY, moved: 0, height: lp[1], planeY,
        offset: hit ? { x: lp[0] - hit.x, z: lp[2] - hit.z } : { x: 0, z: 0 } };
    } else drag = { mode: "orbit", x: e.clientX, y: e.clientY, moved: 0 };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      autoFit = false;
      view.radius = Math.max(2.2, Math.min(12, pinch.r * (pinch.d / Math.max(20, d))));
      render();
      return;
    }
    if (!drag) { hover(e); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === "orbit") {
      view.yaw -= dx * 0.008; view.pitch = Math.max(0.02, Math.min(1.45, view.pitch + dy * 0.006));
      if (drag.moved > 5) autoFit = false;
      render();
    } else if (drag.mode === "move") {
      const hit = onPlane(e, drag.planeY);
      if (!hit) return;
      const x = hit.x + drag.offset.x, z = hit.z + drag.offset.z;
      const h = Math.max(0.3, Math.min(4, Math.hypot(x, z)));
      onMove(drag.id, place(Math.atan2(x, z), h, drag.height), "drag3d-" + drag.id);
    } else {
      // Raise or lower: about 1 m per 200 px, keeping the same spot on the floor.
      const o = findObj(drag.id);
      const pos = lightPosition(o), h = Math.max(0.3, Math.hypot(pos[0], pos[2]));
      drag.height = Math.max(FLOOR + 0.3, Math.min(2.2, drag.height - dy * 0.005));
      onMove(drag.id, place(Math.atan2(pos[0], pos[2]), h, drag.height), "lift3d-" + drag.id);
    }
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && drag.mode !== "orbit" && drag.moved > 0) { onEndGroup(); autoFit = false; }
    drag = null;
  };
  // Show a move cursor over anything that can be dragged (checked at most once a frame).
  let hoverQueued = false, lastHover = null;
  function hover(e) {
    lastHover = e;
    if (hoverQueued || e.pointerType === "touch") return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      const o = findObj(hitId(lastHover));
      canvas.style.cursor = movable(o) ? "move" : "";
    });
  }
  canvas.addEventListener("pointerleave", () => { canvas.style.cursor = ""; });
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  // Azimuth (radians), horizontal distance and height -> the app's light controls.
  function place(az, horiz, height) {
    const distance = Math.max(0.4, Math.min(4, Math.hypot(horiz, height)));
    const elevationDeg = Math.max(-30, Math.min(75, (Math.atan2(height, horiz) * 180) / Math.PI));
    return { azimuthDeg: Math.round((az * 180) / Math.PI), elevationDeg: Math.round(elevationDeg), distance: Math.round(distance * 100) / 100 };
  }

  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  canvas.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: () => (view.yaw += 0.12), ArrowRight: () => (view.yaw -= 0.12), ArrowUp: () => (view.pitch = Math.min(1.45, view.pitch + 0.08)),
      ArrowDown: () => (view.pitch = Math.max(0.02, view.pitch - 0.08)), "+": () => zoom(1 / 1.15), "=": () => zoom(1 / 1.15), "-": () => zoom(1.15), Home: () => reset() }[e.key];
    if (k) { e.preventDefault(); if (e.key !== "Home") autoFit = false; k(); render(); }
  });
  function zoom(f) { autoFit = false; view.radius = Math.max(2.2, Math.min(12, view.radius * f)); render(); }

  // ----- Framing -----
  // Until the student moves the view themselves, zoom out far enough to show every light.
  let autoFit = true;
  function fitted() {
    let far = 1.6, sumX = 0, n = 0;
    for (const o of state ? [...state.lights.filter((l) => l.role !== "backdrop"), ...state.reflectors] : []) {
      const p = lightPosition(o); far = Math.max(far, Math.hypot(p[0], p[2]), p[1] + 0.5);
      sumX += p[0]; n++;
    }
    return { x: n ? Math.max(-1, Math.min(1, (sumX / n) * 0.5)) : 0, radius: Math.max(5.6, Math.min(12, 2.6 + far * 2.5)), far };
  }
  function fit() {
    // Never re-frame while something is being dragged: the scene would slide under the cursor.
    if (!autoFit || !state || drag) return;
    const f = fitted();
    view.target.x = f.x; view.radius = f.radius;
  }
  function reset() { view.yaw = 0.2; view.pitch = 0.62; view.target.set(0, -0.4, -0.25); autoFit = true; fit(); }
  // Quick views. Each keeps every light in frame.
  const VIEWS = {
    camera: { label: "From the camera", yaw: 0.16, pitch: 0.2, scale: 1.0 },   // just over the camera's shoulder
    above: { label: "From above", yaw: 0, pitch: 1.45, scale: 1.05 },
    side: { label: "From the side", yaw: Math.PI / 2, pitch: 0.1, scale: 1.0 },
    behind: { label: "From behind", yaw: Math.PI, pitch: 0.3, scale: 1.0 },
  };
  function goTo(name) {
    if (name === "reset") { reset(); render(); return; }
    const v = VIEWS[name], f = fitted();
    autoFit = false;
    view.yaw = v.yaw; view.pitch = v.pitch;
    view.target.set(name === "side" || name === "behind" ? 0 : f.x, -0.35, name === "above" ? 0 : -0.2);
    view.radius = Math.max(4.5, Math.min(12, f.radius * v.scale));
    render();
  }
  const bar = document.createElement("div");
  bar.className = "views3d";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Quick views");
  for (const [k, label] of [...Object.entries(VIEWS).map(([k, v]) => [k, v.label]), ["reset", "Reset"]]) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.view3d = k;
    b.addEventListener("click", () => goTo(k));
    bar.appendChild(b);
  }
  container.insertBefore(bar, canvas);

  return {
    canvas,
    update(s, sel) {
      state = s; selected = sel;
      const sig = JSON.stringify([s.lights.map((l) => [l.id, l.role, l.fixture, l.modifier, l.on, l.azimuthDeg, l.elevationDeg, l.distance, l.flood, l.shutters, l.flag, l.sizeOverride, l.gel, l.color, l.kelvin]),
        s.reflectors, s.backdrop.distance]);
      if (sig !== gearSig) { gearSig = sig; rebuildGear(s); }
      updateGear(s);
      fit();
      render();
    },
    resetView() { reset(); render(); },
    goTo,
    // Where a light appears on screen (page coordinates); used by the tests.
    project(id, y) {
      const o = findObj(id); if (!o) return null;
      const p = lightPosition(o);
      const v = new THREE.Vector3(p[0], y ?? p[1], p[2]).project(cam), r = canvas.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    },
    dispose() { renderer.dispose(); canvas.remove(); },
  };

  // ---------- Models ----------
  function fixtureModel(THREE, l, s, p, target) {
    const f = fixture(l.fixture), m = modifier(l.modifier) || {}, spec = lightSpec(l, s);
    const roleColor = ROLE_COLORS[l.role] || "#ffffff";
    const on = l.on && l.power > 0;
    const glowColor = new THREE.Color().setRGB(...spec.color.map((c) => (on ? c : 0.08)), THREE.LinearSRGBColorSpace);
    const glow = new THREE.MeshBasicMaterial({ color: glowColor });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1d1e22, roughness: 0.6, metalness: 0.2 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.9, side: THREE.DoubleSide });
    const head = new THREE.Group();      // built facing -z, then aimed at the target
    const id = l.modifier;
    if (id === "cb60-softbox" || id === "s45-softbox" || id === "torjim-softbox" || id === "any-size") {
      const w = spec.size, d = Math.max(0.18, w * 0.5);
      const box = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.72, 0.09, d, 4, 1, true), dark);
      box.rotation.x = -Math.PI / 2; box.rotation.y = Math.PI / 4; box.position.z = -d / 2;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, w), glow);
      face.position.z = -d - 0.001; face.rotation.y = Math.PI;
      head.add(box, face, body(0.12));
    } else if (id.startsWith("umbrella")) {
      const tint = { "umbrella-gold": 0xd9a63a, "umbrella-silver": 0xd6d9df }[id];
      const r = spec.size / 2, shoot = id === "umbrella-white";
      // Shoot-through: the umbrella sits in front, light passes through it. Bounce: it
      // sits behind the light and reflects back toward the subject.
      const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), shoot ? new THREE.MeshBasicMaterial({ color: glowColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }) : new THREE.MeshStandardMaterial({ color: tint, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }));
      dome.rotation.x = shoot ? -Math.PI / 2 : Math.PI / 2;
      dome.position.z = shoot ? -0.05 - r * 0.1 : 0.45 + r * 0.25;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 6), dark);
      shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.1;
      head.add(dome, shaft, body(0.12));
      if (!shoot) { const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), glow); bulb.position.z = 0.12; head.add(bulb); }
    } else if (id === "fresnel-lens") {
      const s2 = (f.lensSize || 0.1) * 2;
      const housing = new THREE.Mesh(new THREE.BoxGeometry(s2, s2, s2 * 1.2), dark);
      housing.position.z = s2 * 0.6;
      const lensDisc = new THREE.Mesh(new THREE.CircleGeometry(spec.size / 2, 24), glow);
      lensDisc.rotation.y = Math.PI; lensDisc.position.z = -0.002;
      head.add(housing, lensDisc);
      // Barn doors, swung open or folded in to match the scene. In this model +x is the
      // beam's "right", the same frame the lighting maths uses, so "camera side" matches.
      const dir = norm(sub(target, p));
      const rz = dir[0];                       // z of cross(dir, up) = dir.x
      const camSign = rz >= 0 ? 1 : -1;        // +x faces the camera when right.z >= 0
      const sh = l.shutters || {}, depth = s2 * 0.7;
      const doors = [["top", 0, 1], ["bottom", 0, -1], ["camera", camSign, 0], ["backdrop", -camSign, 0]];
      for (const [side, sx, sy] of doors) {
        const amt = Math.max(sh[side] || 0, l.flag?.side === side ? l.flag.amount : 0);
        const swing = 0.5 - amt * 1.7;              // 0.5 rad open outward ... about 1.2 rad folded in
        const hinge = new THREE.Group();
        hinge.position.set((sx * s2) / 2, (sy * s2) / 2, 0);
        const d = new THREE.Mesh(new THREE.PlaneGeometry(sy ? s2 : depth, sy ? depth : s2), new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.7, side: THREE.DoubleSide }));
        d.position.z = -depth / 2;
        if (sy) { d.rotation.x = -Math.PI / 2; hinge.rotation.x = sy * swing; }
        else { d.rotation.y = Math.PI / 2; hinge.rotation.y = -sx * swing; }
        hinge.add(d);
        head.add(hinge);
      }
    } else if (id === "panel-bare") {
      const w = spec.size, h2 = w * 0.65;
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h2 + 0.03, 0.04), dark);
      back.position.z = 0.025;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h2), glow);
      face.rotation.y = Math.PI;
      head.add(back, face);
    } else if (id === "snoot") {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.3, 20, 1, true), dark);
      tube.rotation.x = Math.PI / 2; tube.position.z = -0.15;
      const tip = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), glow);
      tip.rotation.y = Math.PI; tip.position.z = -0.301;
      head.add(tube, tip, body(0.12));
    } else if (id === "gobo") {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.32, 20), dark);
      barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.16;
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.06), dark);
      slot.position.z = -0.1; slot.position.y = 0.06;
      const tip = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), glow);
      tip.rotation.y = Math.PI; tip.position.z = -0.321;
      head.add(barrel, slot, tip, body(0.12));
    } else if (id === "cb60-reflector") {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(spec.size / 2, 0.06, 0.16, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xb9bcc3, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
      cone.rotation.x = -Math.PI / 2; cone.position.z = -0.08;
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), glow);
      bulb.rotation.y = Math.PI; bulb.position.z = -0.01;
      head.add(cone, bulb, body(0.12));
    } else {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.05, spec.size / 2), 16, 12), glow);
      head.add(bulb, body(0.08));
    }
    head.position.set(...p);
    head.lookAt(...target);
    head.rotateY(Math.PI);    // models are built facing -z; lookAt points +z at the target
    const g = new THREE.Group();
    g.add(head);
    // Beam: a faint cone in the role's colour, from the light toward where it points.
    if (on) {
      const len = Math.hypot(...sub(target, p)) * 0.92;
      const r = Math.min(0.6, Math.max(0.08, Math.tan((spec.coneDeg * Math.PI) / 180) * len * 0.3));
      const beam = new THREE.Mesh(new THREE.ConeGeometry(r, len, 24, 1, true), new THREE.MeshBasicMaterial({ color: roleColor, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.set(...add(p, scale(sub(target, p), 0.46)));
      beam.lookAt(...target);
      beam.rotateX(-Math.PI / 2);
      beam.userData.noPick = true;
      g.add(beam);
    }
    const letter = ROLES[l.role].letter;
    g.add(label(THREE, letter, roleColor, p[0], p[1] + 0.32, p[2], 0.26, true, !on));
    // Selection ring on the floor.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), new THREE.MeshBasicMaterial({ color: roleColor, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p[0], FLOOR + 0.01, p[2]);
    ring.userData.selRing = true; ring.userData.noPick = true; ring.visible = false;
    g.add(ring);
    return g;

    function body(r) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, r * 1.6, 16), dark);
      b.rotation.x = Math.PI / 2; b.position.z = r * 0.8;
      return b;
    }
  }
}

// A disc on the floor under a light: the easiest thing to grab when moving it around.
function floorDisc(THREE, p, color, dim) {
  const d = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: dim ? 0.12 : 0.28, depthWrite: false, side: THREE.DoubleSide }));
  d.rotation.x = -Math.PI / 2;
  d.position.set(p[0], FLOOR + 0.006, p[2]);
  return d;
}

function dist2(a, b) { const d = sub(a, b); return d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; }

function stand(THREE, x, floorY, z, height, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4 });
  const h = Math.max(0.05, height);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, h, 8), mat);
  pole.position.set(x, floorY + h / 2, z);
  g.add(pole);
  // An invisible, fatter sleeve around the pole so it's easy to grab with a mouse or finger.
  const grab = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  grab.position.copy(pole.position);
  g.add(grab);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 6), mat);
    leg.position.set(x + Math.cos(a) * 0.16, floorY + 0.12, z + Math.sin(a) * 0.16);
    leg.rotation.z = Math.cos(a) * 0.95; leg.rotation.x = -Math.sin(a) * 0.95;
    g.add(leg);
  }
  return g;
}

// A text tag that always faces the viewer.
function label(THREE, text, color, x, y, z, size, round = false, dim = false) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d");
  if (round) {
    g.fillStyle = dim ? "#1b1c21" : color; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = color; g.stroke();
    g.fillStyle = dim ? color : "#0e0f12"; g.font = `bold ${text.length > 1 ? 52 : 70}px system-ui, sans-serif`;
  } else { g.fillStyle = color; g.font = "bold 34px system-ui, sans-serif"; }
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.position.set(x, y, z); sprite.scale.set(size, size, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function ellipsoid(THREE, { c, r }, front, material) {
  const g = new THREE.SphereGeometry(1, front ? 96 : 40, front ? 72 : 28);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let x = c[0] + v.x * r[0], y = c[1] + v.y * r[1], z = c[2] + v.z * r[2];
    if (front && v.z > 0) z += featureHeight(x, y) * THREE.MathUtils.smoothstep(v.z, 0.15, 0.55);
    pos.setXYZ(i, x * UNIT, y * UNIT, z * UNIT);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}
