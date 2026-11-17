// The studio renderer (Phase 1's candidate B): one full-screen WebGL 2 shader, no library.
// The head is a signed-distance shape. Each pixel marches to the head or the backdrop, then
// marches a soft-shadow ray toward each light. Shadow softness comes from the light's size
// and distance (a cone of half-angle atan(radius / distance)), so big + close = soft,
// small + far = hard, and a shadow softens the farther it falls from what casts it.
import { CAMERA, HEAD, UNIT, SKIN } from "../scene/head.js";
import { resolveLights, exposureFor, materials, whiteBalanceGain } from "../scene/lightmath.js";

export const LEVELS = {
  low:    { scale: 0.5,  steps: 48, shadowSteps: 20 },
  medium: { scale: 0.75, steps: 64, shadowSteps: 32 },
  high:   { scale: 1.0,  steps: 96, shadowSteps: 48 },
};
const MAX_LIGHTS = 10;

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

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
uniform float uExposure; uniform vec3 uWB;

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
  outColor = vec4(clamp(col * uExposure * uWB, 0.0, 1.0), 1.0);
}`;
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
    gl.uniform3fv(U.uCamPos, CAMERA.position);
    gl.uniform3fv(U.uCamTarget, CAMERA.target);
    gl.uniform1f(U.uFov, CAMERA.fovDeg);
  }

  return {
    kind: "3d",
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
      gl.viewport(0, 0, px, px);
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      upload(U, state, px, px);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Reading one pixel back forces the frame to finish, so the timing is real.
      if (measure) { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return performance.now() - t0; }
      return 0;
    },
  };
}
