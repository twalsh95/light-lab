// Candidate B: a custom full-screen shader. No three.js.
// The head is a signed-distance shape (the prototype's ellipsoids and bumps). Each pixel
// marches a ray to the head or the backdrop, then marches a shadow ray toward each light.
// Softness comes straight from the light's size and distance: a cone of half-angle
// atan(radius / distance) around the shadow ray. That gives the real behaviour students
// should learn: big + close = soft, small + far = hard, and shadows soften with distance
// from the object casting them (a nose shadow is crisper than the head's wall shadow).
import { CAMERA, HEAD, UNIT, SKIN, resolveLights, exposureFor } from "./scene.js";

export const QUALITY = {
  low:    { scale: 0.5,  steps: 48, shadowSteps: 20 },
  medium: { scale: 0.75, steps: 64, shadowSteps: 32 },
  high:   { scale: 1.0,  steps: 96, shadowSteps: 48 },
};
const MAX_LIGHTS = 4;

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

function frag(q) {
  const f = HEAD.features.map(([x, y, sx, sy, a]) =>
    `h += ${a.toFixed(4)} * exp(-(pow((p.x-(${x.toFixed(4)}))/${sx.toFixed(4)},2.0) + pow((p.y-(${y.toFixed(4)}))/${sy.toFixed(4)},2.0)));`).join("\n    ");
  const e = (o) => `vec3(${o.c.map((v) => v.toFixed(4)).join(",")}), vec3(${o.r.map((v) => v.toFixed(4)).join(",")})`;
  return `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform vec2 uRes;
uniform vec3 uCamPos; uniform vec3 uCamTarget; uniform float uFov;
uniform int uNumLights;
uniform vec3 uLPos[${MAX_LIGHTS}]; uniform vec3 uLDir[${MAX_LIGHTS}]; uniform vec3 uLCol[${MAX_LIGHTS}];
uniform float uLSize[${MAX_LIGHTS}]; uniform vec2 uLCone[${MAX_LIGHTS}]; uniform int uLShadow[${MAX_LIGHTS}];
uniform float uBackZ; uniform vec3 uBackAlb; uniform float uAmbient; uniform vec3 uSkin;
uniform float uExposure; uniform int uSrgb;

const float UNIT = ${UNIT.toFixed(4)};
float sdEllipsoid(vec3 p, vec3 c, vec3 r){
  p -= c; float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1;
}
float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float features(vec3 p){
  float h = 0.0;
    ${f}
  return h;
}
// Distance to the subject, in metres.
float map(vec3 pw){
  vec3 p = pw / UNIT;
  float head = sdEllipsoid(p, ${e(HEAD.head)});
  float front = smoothstep(0.15, 0.55, (p.z - ${HEAD.head.c[2].toFixed(4)}) / ${HEAD.head.r[2].toFixed(4)});
  head -= features(p) * front * 0.85;
  float neck = sdEllipsoid(p, ${e(HEAD.neck)});
  float sh = sdEllipsoid(p, ${e(HEAD.shoulders)});
  float d = smin(smin(head, neck, 0.06), sh, 0.06);
  return d * UNIT * 0.8;   // 0.8: the bumps bend the distance field, so step a little short
}
vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.0, -1.0); const float h = 0.0006;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}
// Ray vs the subject's bounding box, so empty space costs nothing.
bool hitBox(vec3 ro, vec3 rd, out float t0, out float t1){
  vec3 bmin = vec3(-0.215, -0.42, -0.10), bmax = vec3(0.215, 0.17, 0.13);
  vec3 inv = 1.0 / rd; vec3 a = (bmin - ro) * inv, b = (bmax - ro) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  t0 = max(max(lo.x, lo.y), lo.z); t1 = min(min(hi.x, hi.y), hi.z);
  return t1 > max(t0, 0.0);
}
// Soft shadow toward a light of half-angle 'tanA' (radius / distance).
float softShadow(vec3 ro, vec3 rd, float tmax, float tanA){
  float t0, t1;
  if (!hitBox(ro, rd, t0, t1)) return 1.0;
  float t = max(0.002, t0); float end = min(tmax, t1);
  float res = 1.0;
  for (int i = 0; i < ${q.shadowSteps}; i++){
    float h = map(ro + rd * t);
    res = min(res, h / (t * tanA));
    t += clamp(h, 0.0015, 0.04);
    if (res < -1.0 || t > end) break;
  }
  res = max(res, -1.0);
  return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);   // smooth, full-width penumbra
}
float cone(int i, vec3 fromLight){
  float c = dot(normalize(fromLight), uLDir[i]);
  return smoothstep(uLCone[i].x, uLCone[i].y, c);
}
vec3 shade(vec3 p, vec3 n, vec3 v, vec3 alb, float rough, float spec){
  vec3 col = alb * uAmbient * (0.75 + 0.25 * n.y);
  for (int i = 0; i < ${MAX_LIGHTS}; i++){
    if (i >= uNumLights) break;
    vec3 toL = uLPos[i] - p; float d2 = dot(toL, toL); float d = sqrt(d2); vec3 l = toL / d;
    float c = cone(i, -toL); if (c <= 0.0) continue;
    float tanA = max(0.004, uLSize[i] * 0.5 / d);
    // A bigger source wraps a little further round the form (area-light approximation).
    float wrap = min(0.35, tanA * 0.6);
    float ndl = clamp((dot(n, l) + wrap) / (1.0 + wrap), 0.0, 1.0);
    if (ndl <= 0.0) continue;
    float s = (uLShadow[i] == 1) ? softShadow(p + n * 0.0015, l, d, tanA) : 1.0;
    vec3 E = uLCol[i] * (c * s / d2);
    // Highlight: a bigger source makes a broader, dimmer highlight (roughness widened by size).
    vec3 hv = normalize(l + v);
    float a2 = rough * rough * rough * rough + tanA * tanA;
    float nh = max(dot(n, hv), 0.0);
    float D = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    float F = spec * 0.04 + (1.0 - spec * 0.04) * pow(1.0 - max(dot(v, hv), 0.0), 5.0) * 0.04;
    col += E * (alb * ndl + F * D * 0.25 * 3.14159 * max(dot(n, l), 0.0));
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
      vec3 p = ro + rd * t; vec3 n = calcNormal(p);
      col = shade(p, n, -rd, uSkin, ${SKIN.roughness.toFixed(3)}, 1.0);
    }
  }
  if (!hit){
    float tb = (uBackZ - ro.z) / rd.z;
    vec3 p = ro + rd * tb;
    col = shade(p, vec3(0.0, 0.0, 1.0), -rd, uBackAlb, 1.0, 0.0);
  }
  col *= uExposure;
  col = clamp(col, 0.0, 1.0);
  if (uSrgb == 1) col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  outColor = vec4(col, 1.0);
}`;
}

export function create(canvas, { quality = "medium", response = "linear" } = {}) {
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
  if (!gl) throw new Error("This device can't run WebGL 2.");
  let q = quality, srgb = response === "srgb" ? 1 : 0, prog = null, U = {}, state = null;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  function compile() {
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag(QUALITY[q])));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    if (prog) gl.deleteProgram(prog);
    prog = p;
    U = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, "");
      U[name] = gl.getUniformLocation(p, name);
    }
    const loc = gl.getAttribLocation(p, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  compile();

  let w = 1, h = 1;
  function resize(cw, ch) {
    const s = (window.devicePixelRatio || 1) * QUALITY[q].scale;
    w = Math.max(1, Math.round(cw * s)); h = Math.max(1, Math.round(ch * s));
    canvas.width = w; canvas.height = h;
  }

  function upload() {
    gl.useProgram(prog);
    const L = resolveLights(state).slice(0, MAX_LIGHTS);
    const flat = (arr, k) => new Float32Array(Array.from({ length: MAX_LIGHTS }, (_, i) => (L[i] ? arr(L[i]) : new Array(k).fill(0))).flat());
    gl.uniform1i(U.uNumLights, L.length);
    gl.uniform3fv(U.uLPos, flat((l) => l.position, 3));
    gl.uniform3fv(U.uLDir, flat((l) => l.dir, 3));
    gl.uniform3fv(U.uLCol, flat((l) => l.color.map((c) => c * l.intensity), 3));
    gl.uniform1fv(U.uLSize, flat((l) => [l.size], 1));
    gl.uniform2fv(U.uLCone, flat((l) => [Math.cos(l.coneDeg * Math.PI / 180), Math.cos(l.coneDeg * 0.6 * Math.PI / 180)], 2));
    gl.uniform1iv(U.uLShadow, new Int32Array(Array.from({ length: MAX_LIGHTS }, (_, i) => (L[i] && L[i].role !== "backdrop" ? 1 : 0))));
    const b = state.backdrop;
    gl.uniform1f(U.uBackZ, -b.distance);
    gl.uniform3fv(U.uBackAlb, b.color.map((c) => c * b.albedo));
    gl.uniform1f(U.uAmbient, state.room.ambient);
    gl.uniform3fv(U.uSkin, SKIN.albedo);
    gl.uniform1f(U.uExposure, exposureFor(state));
    gl.uniform1i(U.uSrgb, srgb);
    gl.uniform3fv(U.uCamPos, CAMERA.position);
    gl.uniform3fv(U.uCamTarget, CAMERA.target);
    gl.uniform1f(U.uFov, CAMERA.fovDeg);
  }

  return {
    name: "B: custom ray-march shader",
    setScene(s) { state = s; upload(); },
    setQuality(nq) { if (nq === q) return; q = nq; compile(); resize(canvas.clientWidth, canvas.clientHeight); if (state) upload(); },
    setResponse(r) { srgb = r === "srgb" ? 1 : 0; if (state) upload(); },
    resize,
    render() {
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.uniform2f(U.uRes, w, h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    gpu: () => gl,
    dispose() { gl.deleteProgram(prog); gl.deleteBuffer(buf); gl.getExtension("WEBGL_lose_context")?.loseContext(); },
  };
}
