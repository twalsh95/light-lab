// Candidate C: progressive path tracing ("Develop"), using three-gpu-pathtracer on the
// same three.js scene as candidate A. Lights are disc emitters (PhysicalSpotLight with a
// radius), so soft shadows and light bouncing off the backdrop come out physically.
// This is for still frames: each change restarts the image, which then clears up over time.
import * as THREE from "three";
import { WebGLPathTracer, PhysicalSpotLight, GradientEquirectTexture } from "three-gpu-pathtracer";
import { makeStudio, disposeStudio } from "./render-a.js";
import { exposureFor } from "./scene.js";

export const QUALITY = {
  low:    { scale: 0.5,  bounces: 2 },
  medium: { scale: 0.75, bounces: 3 },
  high:   { scale: 1.0,  bounces: 4 },
};

export function create(canvas, { quality = "medium", response = "linear" } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.toneMapping = THREE.LinearToneMapping;
  let q = quality, state = null;
  const studio = makeStudio("high", { physicalSpot: PhysicalSpotLight });
  studio.scene.background = new THREE.Color(0, 0, 0);
  // Room bounce as a uniform glow from every direction (radiance = irradiance / pi).
  // The path tracer only re-reads the environment when it's a new texture object,
  // so a change of ambient level swaps in a fresh one.
  let env = null, envLevel = -1;
  function setAmbient(level) {
    if (level === envLevel) return;
    envLevel = level;
    env?.dispose();
    env = new GradientEquirectTexture(16);
    const a = level / Math.PI;
    env.topColor.setRGB(a, a, a, THREE.LinearSRGBColorSpace);
    env.bottomColor.copy(env.topColor);
    env.update();
    studio.scene.environment = env;
  }
  studio.scene.remove(studio.ambient);

  const pt = new WebGLPathTracer(renderer);
  pt.tiles.set(1, 1);
  pt.minSamples = 1;
  pt.renderDelay = 0;
  pt.fadeDuration = 0;
  pt.dynamicLowRes = true;     // a quick low-res preview while the full image starts
  pt.bounces = QUALITY[q].bounces;
  pt.renderScale = QUALITY[q].scale;
  let built = false;

  function setResponse(r) { renderer.outputColorSpace = r === "srgb" ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace; }
  setResponse(response);

  return {
    name: "C: path-traced Develop",
    progressive: true,
    setScene(s) {
      state = s;
      studio.apply(s, 512, false);
      setAmbient(s.room.ambient);
      renderer.toneMappingExposure = exposureFor(s) * Math.PI;
      if (!built) { pt.setScene(studio.scene, studio.camera); built = true; }
      else { pt.updateLights(); pt.updateMaterials(); pt.updateEnvironment(); }
    },
    setQuality(nq) { q = nq; pt.bounces = QUALITY[q].bounces; pt.renderScale = QUALITY[q].scale; pt.reset(); },
    setResponse(r) { setResponse(r); pt.reset(); },
    resize(w, h) {
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(w, h, false);
      studio.camera.aspect = w / h;
      studio.camera.updateProjectionMatrix();
      if (built) pt.updateCamera();
    },
    render() { pt.renderSample(); },
    get samples() { return pt.samples; },
    get compiling() { return pt.isCompiling || pt.samples < 1; },
    get debug() { return { pt, compiling: pt.isCompiling }; },
    restart() { pt.reset(); },
    gpu: () => renderer.getContext(),
    dispose() { pt.dispose(); disposeStudio(studio); env?.dispose(); renderer.dispose(); },
  };
}
