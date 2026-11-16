// Candidate A: real-time three.js with spot lights and shadow maps.
// Light size sets shadow softness by widening the PCF filter (shadow.radius).
// Limits, by design of shadow maps: one blur width per light, so the shadow on the
// backdrop is no softer than the shadow of the nose (real penumbrae widen with distance).
import * as THREE from "three";
import { buildHeadGroup } from "./head-mesh.js";
import { CAMERA, SKIN, resolveLights, exposureFor } from "./scene.js";

export const QUALITY = {
  low:    { scale: 0.5,  mapSize: 512,  mesh: "low" },
  medium: { scale: 0.75, mapSize: 1024, mesh: "medium" },
  high:   { scale: 1.0,  mapSize: 2048, mesh: "high" },
};

// Shared by candidate C (the path tracer uses the same three.js scene).
export function makeStudio(quality, { physicalSpot } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  const camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, 1, 0.1, 20);
  camera.position.set(...CAMERA.position);
  camera.lookAt(...CAMERA.target);

  const skin = new THREE.MeshPhysicalMaterial({ roughness: SKIN.roughness, specularIntensity: SKIN.specular });
  skin.color.setRGB(...SKIN.albedo, THREE.LinearSRGBColorSpace);
  const head = buildHeadGroup(skin, QUALITY[quality].mesh);
  scene.add(head);

  const backdropMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), backdropMat);
  backdrop.receiveShadow = true;
  scene.add(backdrop);

  const ambient = new THREE.AmbientLight(0xffffff, 0);
  scene.add(ambient);

  const lights = new Map();   // id -> SpotLight
  function syncLights(state, mapSize, castShadows = true) {
    const resolved = resolveLights(state);
    const seen = new Set();
    for (const L of resolved) {
      seen.add(L.id);
      let s = lights.get(L.id);
      if (!s) {
        s = physicalSpot ? new physicalSpot() : new THREE.SpotLight();
        s.decay = 2;
        s.distance = 0;
        scene.add(s, s.target);
        lights.set(L.id, s);
      }
      s.position.set(...L.position);
      s.target.position.set(...L.target);
      s.color.setRGB(...L.color, THREE.LinearSRGBColorSpace);
      s.intensity = L.intensity;
      s.angle = THREE.MathUtils.degToRad(L.coneDeg);
      s.penumbra = 0.4;
      if (physicalSpot) s.radius = L.size / 2;

      const d = Math.hypot(...L.position.map((v, i) => v - L.target[i]));
      s.castShadow = castShadows && L.role !== "backdrop";
      if (s.castShadow) {
        if (s.shadow.mapSize.x !== mapSize) {
          s.shadow.mapSize.set(mapSize, mapSize);
          s.shadow.map?.dispose(); s.shadow.map = null;
        }
        // Aim the shadow camera at the subject and the patch of backdrop behind it,
        // not the whole beam, so the shadow map's pixels land where they matter.
        const halfDeg = THREE.MathUtils.radToDeg(Math.atan(0.55 / d));
        s.shadow.focus = Math.min(1, halfDeg / L.coneDeg);
        s.shadow.camera.near = 0.1;
        s.shadow.camera.far = d + 4;
        s.shadow.bias = -0.0004;
        s.shadow.normalBias = 0.0015;
        // Penumbra width for a typical face feature (occluder about 4 cm from the skin):
        // width = source size x gap / distance. Convert to shadow-map texels.
        const fovHalf = Math.atan(0.55 / d);
        const texel = (2 * d * Math.tan(fovHalf)) / mapSize;
        const penumbra = (L.size * 0.04) / d;
        s.shadow.radius = Math.max(1, Math.min(25, penumbra / texel / 2));
        s.shadow.blurSamples = 16;
      }
    }
    for (const [id, s] of lights) {
      if (!seen.has(id)) { scene.remove(s, s.target); s.dispose(); lights.delete(id); }
    }
  }

  function apply(state, mapSize, castShadows) {
    const b = state.backdrop;
    backdrop.position.set(0, 0, -b.distance);
    backdropMat.color.setRGB(b.color[0] * b.albedo, b.color[1] * b.albedo, b.color[2] * b.albedo, THREE.LinearSRGBColorSpace);
    ambient.intensity = state.room.ambient;
    syncLights(state, mapSize, castShadows);
  }

  return { scene, camera, apply, lights, ambient, backdrop, head };
}

export function create(canvas, { quality = "medium", response = "linear" } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.LinearToneMapping;   // a plain exposure multiply, then clip
  let q = quality, state = null, studio = makeStudio(q);

  function setResponse(r) {
    // "linear" shows linear values directly, like the reference renders.
    // "srgb" is the photographic display curve (lifts the shadows).
    renderer.outputColorSpace = r === "srgb" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  }
  setResponse(response);

  function resize(w, h) {
    renderer.setPixelRatio((window.devicePixelRatio || 1) * QUALITY[q].scale);
    renderer.setSize(w, h, false);
    studio.camera.aspect = w / h;
    studio.camera.updateProjectionMatrix();
  }

  return {
    name: "A: three.js shadow maps",
    setScene(s) {
      state = s;
      studio.apply(s, QUALITY[q].mapSize, true);
      // three.js divides diffuse by pi; the meter in scene.js doesn't. Multiply it back.
      renderer.toneMappingExposure = exposureFor(s) * Math.PI;
    },
    setQuality(nq) {
      if (nq === q) return;
      const meshChanged = QUALITY[nq].mesh !== QUALITY[q].mesh;
      q = nq;
      if (meshChanged) { disposeStudio(studio); studio = makeStudio(q); }
      if (state) this.setScene(state);
      const sz = renderer.getSize(new THREE.Vector2());
      resize(sz.x, sz.y);
    },
    setResponse,
    resize,
    render() { renderer.render(studio.scene, studio.camera); },
    gpu: () => renderer.getContext(),
    dispose() { disposeStudio(studio); renderer.dispose(); },
  };
}

export function disposeStudio(studio) {
  studio.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); if (o.isLight) o.dispose?.(); });
}
