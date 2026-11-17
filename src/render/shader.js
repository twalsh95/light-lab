// The studio renderer (Phase 1's candidate B): one full-screen WebGL 2 shader, no library.
// The head is a signed-distance shape. Each pixel marches to the head or the backdrop, then
// marches a soft-shadow ray toward each light. Shadow softness comes from the light's size
// and distance (a cone of half-angle atan(radius / distance)), so big + close = soft,
// small + far = hard, and a shadow softens the farther it falls from what casts it.
import { HEAD, UNIT, SKIN } from "../scene/head.js";
import { resolveLights, exposureFor, materials, whiteBalanceGain, cameraSettings } from "../scene/lightmath.js";
import { cameraGear, cameraView } from "../scene/gear.js";
import { computeMetrics } from "../metrics/metrics.js";

export const LEVELS = {
  low:    { scale: 0.5,  steps: 48, shadowSteps: 20 },
  medium: { scale: 0.75, steps: 64, shadowSteps: 32 },
  high:   { scale: 1.0,  steps: 96, shadowSteps: 48 },
};
const MAX_LIGHTS = 10;

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Lens pass: the camera focuses on the face. The backdrop, farther away, blurs by the
// lens's circle of confusion (bigger at wide apertures like f/1.8, small at f/16).
// High ISO adds grain, mostly visible in the darker tones.
const LENS_FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uRadius; uniform float uGrain;
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main(){
  vec4 c = texture(uTex, vUv);
  vec3 col = c.rgb;
  if (c.a < 0.5 && uRadius > 0.6){
    // Gather backdrop samples in a disc (golden-angle spiral), skipping the subject so it
    // doesn't smear into the background.
    vec3 sum = c.rgb; float wsum = 1.0;
    for (int i = 1; i < 40; i++){
      float r = sqrt(float(i) / 40.0) * uRadius;
      float a = float(i) * 2.39996;
      vec4 s = texture(uTex, vUv + vec2(cos(a), sin(a)) * r / uRes);
      float w = 1.0 - s.a;
      sum += s.rgb * w; wsum += w;
    }
    col = sum / wsum;
  }
  if (uGrain > 0.0){
    float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.3) - 1.0;   // roughly bell-shaped
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col += n * uGrain * (0.45 + 0.55 * (1.0 - l));
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// How much the backdrop blurs, as a fraction of the picture's height: the circle of
// confusion for a lens focused on the face. Cine lenses are marked in T-stops; their
// f-number (which sets depth of field) is about 7% smaller.
export function backdropBlur(state) {
  const { aperture } = cameraSettings(state), { lens, focal, sensorH } = cameraGear(state);
  const N = lens.tStop ? aperture / 1.07 : aperture;
  const f = focal / 1000, s = cameraView(state).distance, d = s + state.backdrop.distance;
  if (s <= f) return 0;
  const cocMm = (f * f / (N * (s - f))) * (Math.abs(d - s) / d) * 1000;
  return cocMm / sensorH;
}
// Grain strength for an ISO: none at base ISO, clearly visible by 3200-6400.
export function grainFor(iso) {
  return iso <= 200 ? 0 : 0.014 * Math.log2(iso / 200);
}

const f4 = (v) => v.toFixed(4);
const vec3 = (a) => `vec3(${a.map(f4).join(",")})`;

function frag(q) {
  const feats = HEAD.features.map(([x, y, sx, sy, a]) =>
    `h += ${f4(a)} * exp(-(pow((p.x-(${f4(x)}))/${f4(sx)},2.0) + pow((p.y-(${f4(y)}))/${f4(sy)},2.0)));`).join("\n    ");
  return `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform vec2 uRes;
uniform vec3 uCamPos; uniform vec3 uCamTarget; uniform float uFov;
uniform int uNumLights;
uniform vec3 uLPos[${MAX_LIGHTS}]; uniform vec3 uLDir[${MAX_LIGHTS}]; uniform vec3 uLCol[${MAX_LIGHTS}];
uniform float uLSize[${MAX_LIGHTS}]; uniform vec2 uLCone[${MAX_LIGHTS}]; uniform int uLShadow[${MAX_LIGHTS}];
uniform vec4 uLShut[${MAX_LIGHTS}]; uniform int uLGobo[${MAX_LIGHTS}];
uniform float uBackZ; uniform vec3 uBackAlb; uniform float uAmbient; uniform vec3 uSkin; uniform vec3 uCloth;
uniform float uExposure; uniform vec3 uWB; uniform float uRaw;

const float UNIT = ${f4(UNIT)};
float sdEllipsoid(vec3 p, vec3 c, vec3 r){ p -= c; float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float features(vec3 p){
  float h = 0.0;
    ${feats}
  return h;
}
float map(vec3 pw){
  vec3 p = pw / UNIT;
  float head = sdEllipsoid(p, ${vec3(HEAD.head.c)}, ${vec3(HEAD.head.r)});
  float front = smoothstep(0.15, 0.55, (p.z - ${f4(HEAD.head.c[2])}) / ${f4(HEAD.head.r[2])});
  head -= features(p) * front * 0.85;
  float neck = sdEllipsoid(p, ${vec3(HEAD.neck.c)}, ${vec3(HEAD.neck.r)});
  float sh = sdEllipsoid(p, ${vec3(HEAD.shoulders.c)}, ${vec3(HEAD.shoulders.r)});
  return smin(smin(head, neck, 0.06), sh, 0.06) * UNIT * 0.8;
}
vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float h = 0.0006;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}
bool hitBox(vec3 ro, vec3 rd, out float t0, out float t1){
  vec3 bmin = vec3(-0.215, -0.42, -0.10), bmax = vec3(0.215, 0.17, 0.13);
  vec3 inv = 1.0 / rd; vec3 a = (bmin - ro) * inv, b = (bmax - ro) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  t0 = max(max(lo.x, lo.y), lo.z); t1 = min(min(hi.x, hi.y), hi.z);
  return t1 > max(t0, 0.0);
}
float softShadow(vec3 ro, vec3 rd, float tmax, float tanA){
  float t0, t1;
  if (!hitBox(ro, rd, t0, t1)) return 1.0;
  float t = max(0.002, t0); float end = min(tmax, t1); float res = 1.0;
  for (int i = 0; i < ${q.shadowSteps}; i++){
    float h = map(ro + rd * t);
    res = min(res, h / (t * tanA));
    t += clamp(h, 0.0015, 0.04);
    if (res < -1.0 || t > end) break;
  }
  res = max(res, -1.0);
  return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);
}
// Is this point the clothing (shoulders) rather than skin?
bool isClothing(vec3 pw){
  vec3 p = pw / UNIT;
  float neck = sdEllipsoid(p, ${vec3(HEAD.neck.c)}, ${vec3(HEAD.neck.r)});
  float sh = sdEllipsoid(p, ${vec3(HEAD.shoulders.c)}, ${vec3(HEAD.shoulders.r)});
  return sh < neck && p.y < -0.9;
}
// Gobo patterns, in beam coordinates (-1..1 across the beam). 1 = light passes.
float gobo(int id, vec2 uv){
  if (id == 1){ // window: four panes with a frame
    vec2 g = abs(fract(uv * 1.2 + 0.5) - 0.5);
    return smoothstep(0.03, 0.07, min(g.x, g.y)) * step(max(abs(uv.x), abs(uv.y)), 0.85);
  }
  if (id == 2) return smoothstep(0.15, 0.35, abs(fract(uv.y * 3.5) - 0.5) * 2.0);          // blinds
  if (id == 3) return 1.0 - smoothstep(0.2, 0.3, length(fract(uv * 2.5) - 0.5));         // dots
  if (id == 4) return smoothstep(0.2, 0.4, abs(fract((uv.x + uv.y) * 2.2) - 0.5) * 2.0);  // diagonal bars
  if (id == 5){ // window with small panes (three by three)
    vec2 g = abs(fract(uv * 3.2 + 0.5) - 0.5);
    return smoothstep(0.05, 0.09, min(g.x, g.y)) * step(max(abs(uv.x), abs(uv.y)), 0.86);
  }
  if (id == 6){ // arched window: rectangle with a round top, two crossing glazing bars
    bool inside = (uv.y < 0.15 && abs(uv.x) < 0.5 && uv.y > -0.85) || length(vec2(uv.x, uv.y - 0.15)) < 0.5;
    float bars = smoothstep(0.02, 0.045, abs(uv.x)) * smoothstep(0.02, 0.045, abs(uv.y + 0.3));
    return inside ? bars : 0.0;
  }
  if (id == 7) return smoothstep(0.25, 0.45, abs(fract(uv.y * 2.0) - 0.5) * 2.0);            // wide blinds
  if (id == 8){ // underwater: rippling bright lines over a dimmer wash
    vec2 q = uv * 3.0;
    float w = sin(q.x * 2.1 + sin(q.y * 1.7) * 1.6) + sin(q.y * 2.4 + sin(q.x * 1.3) * 1.8) + sin((q.x + q.y) * 1.6);
    return 0.3 + 0.7 * pow(1.0 - abs(w) / 3.0, 6.0);
  }
  return 1.0;
}
// Barn doors, flags and gobos: how much of the beam reaches this point.
float beamMask(int i, vec3 p, float tanA){
  vec3 f = uLDir[i];
  vec3 r = cross(f, vec3(0.0, 1.0, 0.0));
  r = length(r) < 0.001 ? vec3(1.0, 0.0, 0.0) : normalize(r);
  vec3 u = cross(r, f);
  vec3 v = p - uLPos[i]; float z = dot(v, f);
  if (z <= 0.0) return 0.0;
  float x = dot(v, r) / z, y = dot(v, u) / z;
  // Edges blur with the size of the light (a barn door sits about 0.25 m from the source).
  float w = clamp(tanA * 2.0, 0.015, 0.3);
  vec4 s = uLShut[i];
  float m = smoothstep(s.x - w, s.x + w, x) * (1.0 - smoothstep(s.y - w, s.y + w, x))
          * smoothstep(s.z - w, s.z + w, y) * (1.0 - smoothstep(s.w - w, s.w + w, y));
  if (uLGobo[i] > 0){
    float T = tan(min(uLCone[i].x, 1.4));
    m *= gobo(uLGobo[i], vec2(x, y) / T);
  }
  return m;
}
vec3 shade(vec3 p, vec3 n, vec3 v, vec3 alb, float rough, float specOn){
  vec3 col = alb * uAmbient * (0.75 + 0.25 * n.y);
  for (int i = 0; i < ${MAX_LIGHTS}; i++){
    if (i >= uNumLights) break;
    vec3 toL = uLPos[i] - p; float d2 = dot(toL, toL); float d = sqrt(d2); vec3 l = toL / d;
    // Beam: half brightness at the published beam angle, then spill fading out by twice that.
    float th = acos(clamp(dot(-l, uLDir[i]), -1.0, 1.0)), b = uLCone[i].x;
    if (th >= 2.0 * b) continue;
    float c = exp(-0.6931 * pow(th / b, 4.0)) * (1.0 - smoothstep(1.6 * b, 2.0 * b, th));
    float tanA = max(0.004, uLSize[i] * 0.5 / d);
    c *= beamMask(i, p, tanA); if (c <= 0.0) continue;
    float wrap = min(0.35, tanA * 0.6);
    float ndl = clamp((dot(n, l) + wrap) / (1.0 + wrap), 0.0, 1.0);
    if (ndl <= 0.0) continue;
    float s = (uLShadow[i] == 1) ? softShadow(p + n * 0.0015, l, d, tanA) : 1.0;
    vec3 E = uLCol[i] * (c * s / d2);
    vec3 hv = normalize(l + v);
    float a2 = rough * rough * rough * rough + tanA * tanA;
    float nh = max(dot(n, hv), 0.0);
    float D = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(v, hv), 0.0), 5.0);
    col += E * (alb * ndl + specOn * F * D * 0.25 * 3.14159 * max(dot(n, l), 0.0));
  }
  return col;
}
void main(){
  vec3 fw = normalize(uCamTarget - uCamPos);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec2 ndc = vUv * 2.0 - 1.0;
  float th = tan(radians(uFov) * 0.5);
  vec3 rd = normalize(fw + ndc.x * th * (uRes.x / uRes.y) * rt + ndc.y * th * up);
  vec3 ro = uCamPos;
  vec3 col; bool hit = false; float t0, t1;
  if (hitBox(ro, rd, t0, t1)){
    float t = max(t0, 0.0);
    for (int i = 0; i < ${q.steps}; i++){
      float h = map(ro + rd * t);
      if (h < 0.0003){ hit = true; break; }
      t += h;
      if (t > t1) break;
    }
    if (hit){
      vec3 p = ro + rd * t;
      bool cloth = isClothing(p);
      col = shade(p, calcNormal(p), -rd, cloth ? uCloth : uSkin, cloth ? 0.8 : ${SKIN.roughness.toFixed(3)}, cloth ? 0.3 : 1.0);
    }
  }
  if (!hit){
    float tb = (uBackZ - ro.z) / rd.z;
    col = shade(ro + rd * tb, vec3(0.0, 0.0, 1.0), -rd, uBackAlb, 1.0, 0.0);
  }
  // Linear values shown directly, then clipped: the contrasty look of the reference renders.
  // alpha: 1 = subject (in focus). uRaw: unclipped values for measuring (see measure()).
  vec3 v = col * uExposure * uWB;
  outColor = vec4(uRaw > 0.5 ? v : clamp(v, 0.0, 1.0), hit ? 1.0 : 0.0);
}`;
}

// Where the face is in an n x n frame from this camera: the column of the nose line, the row
// of the jaw, and how far either side of the nose the face reaches.
export function facePixels(state, n) {
  const cv = cameraView(state);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const fw = nrm(sub(cv.target, cv.position)), rt = nrm([-fw[2], 0, fw[0]]), up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
  const th = Math.tan((cv.fovDeg * Math.PI) / 360);
  const project = (pw) => { const v = sub(pw, cv.position), z = dot(v, fw); return { x: (dot(v, rt) / (z * th) * 0.5 + 0.5) * n, y: (1 - (dot(v, up) / (z * th) * 0.5 + 0.5)) * n }; };
  const nose = project([0, 0, 0.1]), jaw = project([0, -0.45 * UNIT, 0.08]), cheek = project([0.9 * HEAD.head.r[0] * UNIT, 0, 0.03]);
  return { noseX: Math.round(nose.x), jawRow: Math.round(jaw.y), halfWidth: Math.abs(cheek.x - nose.x) };
}

// Throws a plain-language Error if this device can't run it.
export function createShaderRenderer(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  if (!gl) throw new Error("This device can't run the 3D view (no WebGL 2).");
  const programs = {};
  let lost = false;
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  // The scene is drawn into a texture first, then the lens pass draws it to the screen.
  let target = null;
  function offscreen(px) {
    if (target && target.px === px) return target;
    if (target) { gl.deleteTexture(target.tex); gl.deleteFramebuffer(target.fb); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, px, px, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (target = { tex, fb, px });
  }
  let lensProg = null;
  function lens() {
    if (lensProg) return lensProg;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("The 3D view couldn't start on this device (" + gl.getShaderInfoLog(s) + ").");
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, LENS_FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("The 3D view couldn't start on this device.");
    const U = {};
    for (const n of ["uTex", "uRes", "uRadius", "uGrain"]) U[n] = gl.getUniformLocation(p, n);
    return (lensProg = { p, U, loc: gl.getAttribLocation(p, "aPos") });
  }

  function program(level) {
    if (programs[level]) return programs[level];
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("The 3D view couldn't start on this device (" + gl.getShaderInfoLog(s) + ").");
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag(LEVELS[level])));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("The 3D view couldn't start on this device.");
    const U = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ""); U[name] = gl.getUniformLocation(p, name); }
    return (programs[level] = { p, U, loc: gl.getAttribLocation(p, "aPos") });
  }

  function upload(U, state, w, h) {
    const L = resolveLights(state).slice(0, MAX_LIGHTS);
    const pad = (fn, k) => new Float32Array(Array.from({ length: MAX_LIGHTS }, (_, i) => (L[i] ? fn(L[i]) : new Array(k).fill(0))).flat());
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1i(U.uNumLights, L.length);
    gl.uniform3fv(U.uLPos, pad((l) => l.position, 3));
    gl.uniform3fv(U.uLDir, pad((l) => l.dir, 3));
    gl.uniform3fv(U.uLCol, pad((l) => l.color.map((c) => c * l.intensity), 3));
    gl.uniform1fv(U.uLSize, pad((l) => [l.size], 1));
    gl.uniform2fv(U.uLCone, pad((l) => [Math.max(1, l.coneDeg) * Math.PI / 180, 0], 2));
    gl.uniform1iv(U.uLShadow, new Int32Array(Array.from({ length: MAX_LIGHTS }, (_, i) => (L[i] && L[i].shadow ? 1 : 0))));
    gl.uniform4fv(U.uLShut, pad((l) => [l.shutters.xmin, l.shutters.xmax, l.shutters.ymin, l.shutters.ymax], 4));
    gl.uniform1iv(U.uLGobo, new Int32Array(Array.from({ length: MAX_LIGHTS }, (_, i) => (L[i] ? L[i].gobo || 0 : 0))));
    const mat = materials(state);
    gl.uniform1f(U.uBackZ, -state.backdrop.distance);
    gl.uniform3fv(U.uBackAlb, mat.backdrop);
    gl.uniform1f(U.uAmbient, state.room.ambient);
    gl.uniform3fv(U.uSkin, mat.skin);
    gl.uniform3fv(U.uCloth, mat.clothing);
    gl.uniform1f(U.uExposure, exposureFor(state));
    gl.uniform3fv(U.uWB, whiteBalanceGain(state));
    const cv = cameraView(state);
    gl.uniform3fv(U.uCamPos, cv.position);
    gl.uniform3fv(U.uCamTarget, cv.target);
    gl.uniform1f(U.uFov, cv.fovDeg);
  }

  // Measuring: the scene pass into a small unclipped (float) target, read back, with masks
  // for the subject and face worked out from where the camera is.
  const floatOK = !!gl.getExtension("EXT_color_buffer_float");
  let mt = null;
  function measureTarget(n) {
    if (mt && mt.n === n) return mt;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (floatOK) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, n, n, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (mt = { tex, fb, n });
  }
  function measure(state, n = 96) {
    const { p, U, loc } = program("medium"), T = measureTarget(n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    gl.viewport(0, 0, n, n);
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    upload(U, state, n, n);
    // 8-bit fallback: measure a quarter as bright so highlights don't clip, then scale back.
    const scale = floatOK ? 1 : 0.25;
    gl.uniform1f(U.uExposure, exposureFor(state) * scale);
    gl.uniform1f(U.uRaw, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.uniform1f(U.uRaw, 0);
    let px;
    if (floatOK) { px = new Float32Array(n * n * 4); gl.readPixels(0, 0, n, n, gl.RGBA, gl.FLOAT, px); }
    else { const b8 = new Uint8Array(n * n * 4); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, b8); px = Float32Array.from(b8, (v) => v / 255); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // readPixels starts at the bottom row; flip to top-first.
    const rgb = new Float32Array(n * n * 3), subject = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const src = ((n - 1 - y) * n + x) * 4, k = y * n + x;
      rgb[k * 3] = px[src] / scale; rgb[k * 3 + 1] = px[src + 1] / scale; rgb[k * 3 + 2] = px[src + 2] / scale;
      subject[k] = px[src + 3] > 0.5 ? 1 : 0;
    }
    const geo = facePixels(state, n), face = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = y * n + x;
      if (subject[k] && y < geo.jawRow && Math.abs(x - geo.noseX) < geo.halfWidth) face[k] = 1;
    }
    return computeMetrics({ w: n, h: n, rgb, subject, face, noseX: geo.noseX });
  }

  return {
    kind: "3d",
    measure,
    get lost() { return lost || gl.isContextLost(); },
    warm(level) { program(level); },
    // Draws one frame. cssSize = the view's size on screen. Returns the time it took
    // when measure=true (waits for the graphics chip, so only use it while calibrating).
    render(state, level, cssSize, measure = false) {
      const { scale } = LEVELS[level];
      const px = Math.max(64, Math.round(cssSize * Math.min(2, window.devicePixelRatio || 1) * scale));
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
      const { p, U, loc } = program(level);
      const t0 = performance.now();
      const tgt = offscreen(px);
      // 1) The lit scene, into the texture.
      gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fb);
      gl.viewport(0, 0, px, px);
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      upload(U, state, px, px);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2) The lens: backdrop blur and grain, onto the screen.
      const L = lens();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, px, px);
      gl.useProgram(L.p);
      gl.enableVertexAttribArray(L.loc);
      gl.vertexAttribPointer(L.loc, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tgt.tex);
      gl.uniform1i(L.U.uTex, 0);
      gl.uniform2f(L.U.uRes, px, px);
      gl.uniform1f(L.U.uRadius, Math.min(60, (backdropBlur(state) * px) / 2));   // radius in pixels
      gl.uniform1f(L.U.uGrain, grainFor(cameraSettings(state).iso));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Reading one pixel back forces the frame to finish, so the timing is real.
      if (measure) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return performance.now() - t0; }
      return 0;
    },
  };
}
