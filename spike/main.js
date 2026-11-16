// Light Lab rendering spike: page wiring, live controls, and the benchmark.
// Nothing here is sent anywhere. Results stay on the page until you copy or download them.
import { PRESETS } from "./scene.js";

const CANDIDATES = {
  a: { label: "A: three.js shadow maps", load: () => import("./render-a.js") },
  b: { label: "B: custom ray-march shader", load: () => import("./render-b.js") },
  c: { label: "C: path-traced Develop", load: () => import("./render-c.js") },
};
const VIEW = 560;   // CSS pixels: the same view size on every device, so numbers compare

const $ = (id) => document.getElementById(id);
const ui = {
  cand: $("cand"), preset: $("preset"), quality: $("quality"), response: $("response"),
  az: $("az"), el: $("el"), dist: $("dist"), size: $("size"), fill: $("fill"), back: $("back"),
  azOut: $("azOut"), elOut: $("elOut"), distOut: $("distOut"), sizeOut: $("sizeOut"), fillOut: $("fillOut"),
  stage: $("stage"), ref: $("ref"), refCap: $("refCap"), fps: $("fps"), status: $("status"),
  error: $("error"), results: $("results"), resultsText: $("resultsText"), device: $("device"),
};

let current = null;       // { key, r: renderer, canvas }
let state = null;
let benchmarking = false;

function showError(msg) { ui.error.textContent = msg; ui.error.hidden = false; }
window.addEventListener("error", (e) => showError("Something went wrong: " + (e.message || "unknown error") + ". Note it with your results."));
window.addEventListener("unhandledrejection", (e) => showError("Something went wrong: " + (e.reason?.message || e.reason) + ". Note it with your results."));

// ---------- Device info (stays on this page) ----------
function deviceInfo() {
  const info = {
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform || "",
    cpuThreads: navigator.hardwareConcurrency || null,
    memoryGB: navigator.deviceMemory || null,
    screen: `${screen.width}x${screen.height}`,
    devicePixelRatio: window.devicePixelRatio || 1,
    webgl2: false, gpu: "unknown",
  };
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      info.webgl2 = true;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      info.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      info.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch (e) { /* leave defaults */ }
  return info;
}
const DEVICE = deviceInfo();
ui.device.textContent = `${DEVICE.gpu} · ${DEVICE.platform} · ${DEVICE.cpuThreads ?? "?"} threads · ` +
  `${DEVICE.memoryGB ?? "?"} GB · screen ${DEVICE.screen} @${DEVICE.devicePixelRatio}x · WebGL 2: ${DEVICE.webgl2 ? "yes" : "no"}`;
if (!DEVICE.webgl2) showError("This device can't run WebGL 2, so none of the 3D views will work here. Please note the device model with your results.");

// ---------- Scene state from the controls ----------
function loadPreset(key) {
  state = PRESETS[key].build();
  const k = state.lights.find((l) => l.role === "key");
  ui.az.value = k.azimuthDeg; ui.el.value = k.elevationDeg; ui.dist.value = k.distance;
  ui.size.value = k.sizeOverride ?? sizeOf(k);
  const f = state.lights.find((l) => l.role === "fill");
  ui.fill.value = f ? f.power : 0;
  ui.back.checked = !!state.lights.find((l) => l.role === "back");
  ui.ref.src = "../docs/light-lab-reference/" + PRESETS[key].ref;
  ui.refCap.textContent = "Reference: " + PRESETS[key].ref;
  syncOutputs();
  push();
}
function sizeOf(l) { return { "softbox-90": 0.9, "softbox-60": 0.6, umbrella: 1.0, "beauty-dish": 0.55, bare: 0.12, grid: 0.1, fresnel: 0.15 }[l.modifier] ?? 0.3; }

function readControls() {
  const k = state.lights.find((l) => l.role === "key");
  k.azimuthDeg = +ui.az.value; k.elevationDeg = +ui.el.value; k.distance = +ui.dist.value; k.sizeOverride = +ui.size.value;
  let f = state.lights.find((l) => l.role === "fill");
  if (+ui.fill.value > 0) {
    if (!f) state.lights.push(f = { id: "fill", role: "fill", on: true, output: 1, kelvin: 5600, azimuthDeg: 40, elevationDeg: 5, distance: 1.8, modifier: "umbrella", power: 0 });
    f.power = +ui.fill.value; f.on = true;
  } else if (f) f.on = false;
  let b = state.lights.find((l) => l.role === "back");
  if (ui.back.checked && !b) state.lights.push({ id: "back", role: "back", on: true, output: 1, kelvin: 5600, azimuthDeg: 140, elevationDeg: 35, distance: 1.2, modifier: "grid", power: 0.9 });
  if (b) b.on = ui.back.checked;
  syncOutputs();
  push();
}
function syncOutputs() {
  ui.azOut.textContent = `${ui.az.value}°`; ui.elOut.textContent = `${ui.el.value}°`;
  ui.distOut.textContent = `${(+ui.dist.value).toFixed(2)} m`; ui.sizeOut.textContent = `${Math.round(ui.size.value * 100)} cm`;
  ui.fillOut.textContent = (+ui.fill.value).toFixed(2);
}
function push() { if (current && state) current.r.setScene(state); }

// ---------- Candidate switching ----------
async function useCandidate(key) {
  if (current?.key === key) return current;
  if (current) { current.r.dispose(); current.canvas.remove(); current = null; }
  const canvas = document.createElement("canvas");
  canvas.style.width = canvas.style.height = VIEW + "px";
  canvas.setAttribute("aria-label", "Live portrait");
  ui.stage.prepend(canvas);
  ui.status.textContent = "Loading " + CANDIDATES[key].label + "…";
  try {
    const mod = await CANDIDATES[key].load();
    const r = mod.create(canvas, { quality: ui.quality.value, response: ui.response.value });
    r.resize(VIEW, VIEW);
    current = { key, r, canvas, mod };
    if (state) r.setScene(state);
    ui.status.textContent = "";
    return current;
  } catch (e) {
    canvas.remove();
    showError(`${CANDIDATES[key].label} can't run on this device (${e.message}). The other candidates may still work.`);
    ui.status.textContent = "";
    return null;
  }
}

// ---------- Live loop with a rolling frame-rate readout ----------
let last = performance.now(), frames = [], onFrame = null, timer = null;
function loop(now) {
  const dt = now - last; last = now;
  if (onFrame) onFrame(dt, now);
  if (current) {
    const q = timer?.begin();
    current.r.render();
    if (q) timer.end(q);
    timer?.poll();
  }
  frames.push(dt); if (frames.length > 60) frames.shift();
  if (!benchmarking && frames.length > 10) {
    const med = median(frames);
    ui.fps.textContent = current?.r.progressive
      ? `${Math.floor(current.r.samples)} samples · ${med.toFixed(1)} ms per pass`
      : `${(1000 / med).toFixed(0)} fps · ${med.toFixed(1)} ms per frame`;
  }
  requestAnimationFrame(loop);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// GPU time per frame, where the browser allows it. Frame rate tops out at the screen's
// refresh rate (usually 60), so two candidates can both show 60 fps while one has far
// more room to spare. GPU time shows that room. Many browsers hide this timer; then
// the results say "n/a" and the fps numbers are what we go on.
function gpuTimer(gl) {
  const ext = gl && gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!ext) return null;
  const pending = [], results = [];
  return {
    results,
    begin() { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); return q; },
    end(q) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(q); },
    poll() {
      while (pending.length) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) results.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
        pending.shift();
      }
    },
  };
}

// ---------- Benchmark ----------
// A and B: orbit the key light for 6 s per run (first 1 s discarded while shaders warm up).
// C: time until the image reaches 16 and 64 samples (capped at 45 s).
async function orbitRun(seconds) {
  const k = state.lights.find((l) => l.role === "key");
  const startAz = k.azimuthDeg, times = [];
  const t0 = performance.now();
  let gpuFrom = 0;
  timer = gpuTimer(current.r.gpu());
  await new Promise((resolve) => {
    onFrame = (dt, now) => {
      const t = (now - t0) / 1000;
      k.azimuthDeg = startAz + 30 * Math.sin(t * 1.3);
      k.elevationDeg = 25 + 10 * Math.sin(t * 0.7);
      push();
      if (t <= 1 && timer) gpuFrom = timer.results.length;
      if (t > 1) times.push(dt);
      if (t > seconds) { onFrame = null; resolve(); }
    };
  });
  const gpu = timer ? timer.results.slice(gpuFrom) : [];
  timer = null;
  k.azimuthDeg = startAz;
  return {
    gpuMedianMs: gpu.length > 10 ? +median(gpu).toFixed(2) : null,
    medianMs: +median(times).toFixed(2),
    p95Ms: +pct(times, 0.95).toFixed(2),
    medianFps: +(1000 / median(times)).toFixed(1),
    worstFps: +(1000 / pct(times, 0.95)).toFixed(1),
    frames: times.length,
  };
}
async function developRun(capS = 45) {
  current.r.restart();
  const t0 = performance.now(), marks = {};
  await new Promise((resolve) => {
    onFrame = (dt, now) => {
      const s = current.r.samples, t = (now - t0) / 1000;
      if (s >= 16 && !marks.s16) marks.s16 = +t.toFixed(1);
      if (s >= 64 && !marks.s64) marks.s64 = +t.toFixed(1);
      if (marks.s64 || t > capS) { marks.samplesReached = Math.floor(s); marks.seconds = +t.toFixed(1); onFrame = null; resolve(); }
    };
  });
  return { secondsTo16: marks.s16 ?? null, secondsTo64: marks.s64 ?? null, samplesReached: marks.samplesReached, seconds: marks.seconds };
}

async function runBenchmark(which) {
  if (benchmarking) return;
  benchmarking = true;
  setBusy(true);
  const keep = { cand: ui.cand.value, preset: ui.preset.value, quality: ui.quality.value };
  const runs = [];
  const cands = which === "all" ? ["a", "b", "c"] : [ui.cand.value];
  try {
    for (const c of cands) {
      for (const q of c === "c" ? ["low", "medium"] : ["low", "medium", "high"]) {
        for (const p of c === "c" ? ["p3_three"] : ["p3_three", "p5_lowkey"]) {
          ui.fps.textContent = `Benchmark: ${CANDIDATES[c].label}, ${q}, ${PRESETS[p].label}…`;
          ui.cand.value = c; ui.quality.value = q; ui.preset.value = p;
          const cur = await useCandidate(c);
          if (!cur) { runs.push({ candidate: c, quality: q, preset: p, error: "could not start" }); continue; }
          cur.r.setQuality(q);
          loadPreset(p);
          await wait(300);
          const res = c === "c" ? await developRun() : await orbitRun(6);
          runs.push({ candidate: c, quality: q, preset: p, ...res });
          renderResults(runs);
        }
      }
    }
  } finally {
    onFrame = null;
    ui.cand.value = keep.cand; ui.quality.value = keep.quality; ui.preset.value = keep.preset;
    await useCandidate(keep.cand); current?.r.setQuality(keep.quality); loadPreset(keep.preset);
    benchmarking = false;
    setBusy(false);
  }
  renderResults(runs, true);
}
function setBusy(b) {
  document.querySelectorAll("button, select, input").forEach((el) => { el.disabled = b; });
}

let lastReport = null;
function renderResults(runs, done) {
  lastReport = {
    tool: "Light Lab rendering spike", version: 1, date: new Date().toISOString(),
    viewCssPx: VIEW, device: DEVICE, deviceNote: $("deviceNote").value.trim(), runs,
  };
  const rows = runs.map((r) => r.error
    ? `<tr><td>${r.candidate.toUpperCase()}</td><td>${r.quality}</td><td>${PRESETS[r.preset].label}</td><td colspan="4">${r.error}</td></tr>`
    : r.candidate === "c"
      ? `<tr><td>C</td><td>${r.quality}</td><td>${PRESETS[r.preset].label}</td><td colspan="4">16 samples: ${r.secondsTo16 ?? "–"} s · 64 samples: ${r.secondsTo64 ?? "not reached"} s</td></tr>`
      : `<tr><td>${r.candidate.toUpperCase()}</td><td>${r.quality}</td><td>${PRESETS[r.preset].label}</td><td>${r.medianFps}</td><td>${r.worstFps}</td><td>${r.medianMs}</td><td>${r.gpuMedianMs ?? "n/a"}</td></tr>`).join("");
  ui.results.innerHTML = `<table><thead><tr><th>Candidate</th><th>Quality</th><th>Look</th><th>Typical fps</th><th>Worst fps (5%)</th><th>ms per frame</th><th>GPU ms</th></tr></thead><tbody>${rows}</tbody></table>` +
    (done ? `<p class="hint">Done. Copy or download the results and send them to me with the device's name.</p>` : "");
  ui.resultsText.value = JSON.stringify(lastReport, null, 2);
}

// ---------- Wiring ----------
for (const [k, p] of Object.entries(PRESETS)) ui.preset.add(new Option(p.label, k));
for (const [k, c] of Object.entries(CANDIDATES)) ui.cand.add(new Option(c.label, k));
ui.preset.value = "p3_three";
ui.cand.onchange = () => useCandidate(ui.cand.value);
ui.preset.onchange = () => loadPreset(ui.preset.value);
ui.quality.onchange = () => current?.r.setQuality(ui.quality.value);
ui.response.onchange = () => current?.r.setResponse(ui.response.value);
for (const el of [ui.az, ui.el, ui.dist, ui.size, ui.fill, ui.back]) el.addEventListener("input", readControls);
$("benchOne").onclick = () => runBenchmark("one");
$("benchAll").onclick = () => runBenchmark("all");
$("copy").onclick = async () => {
  if (!lastReport) return;
  lastReport.deviceNote = $("deviceNote").value.trim();
  const text = JSON.stringify(lastReport, null, 2);
  try { await navigator.clipboard.writeText(text); $("copy").textContent = "Copied"; }
  catch (e) { ui.resultsText.select(); $("copy").textContent = "Press Ctrl+C to copy"; }
  setTimeout(() => { $("copy").textContent = "Copy results"; }, 2500);
};
$("download").onclick = () => {
  if (!lastReport) return;
  lastReport.deviceNote = $("deviceNote").value.trim();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(lastReport, null, 2)], { type: "application/json" }));
  a.download = "light-lab-spike-results.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("png").onclick = () => {
  if (!current) return;
  current.r.render();   // draw now so the canvas holds a frame when we read it
  const a = document.createElement("a");
  a.href = current.canvas.toDataURL("image/png");
  a.download = `light-lab-${current.key}-${ui.preset.value}.png`;
  a.click();
};

// Side-by-side sheet: one column per look; rows are the reference, A, and B.
// Drawn synchronously (no timers), so it works even while the tab is in the background.
async function comparisonSheet() {
  const keys = Object.keys(PRESETS), S = 220, PAD = 26;
  const out = document.createElement("canvas");
  out.width = S * keys.length; out.height = PAD + S * 3;
  const g = out.getContext("2d");
  g.fillStyle = "#101114"; g.fillRect(0, 0, out.width, out.height);
  g.fillStyle = "#f2f2f4"; g.font = "14px system-ui, sans-serif";
  const imgs = await Promise.all(keys.map((k) => { const i = new Image(); i.src = "../docs/light-lab-reference/" + PRESETS[k].ref; return i.decode().then(() => i); }));
  keys.forEach((k, i) => { g.fillText(PRESETS[k].label.slice(0, 26), i * S + 6, 18); g.drawImage(imgs[i], i * S, PAD, S, S); });
  for (const [row, key] of [[1, "a"], [2, "b"]]) {
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;left:-9999px;width:440px;height:440px";
    document.body.append(cv);
    try {
      const mod = await CANDIDATES[key].load();
      const r = mod.create(cv, { quality: "high", response: ui.response.value });
      r.resize(440, 440);
      keys.forEach((k, i) => { r.setScene(PRESETS[k].build()); r.render(); g.drawImage(cv, i * S, PAD + row * S, S, S); });
      r.dispose();
    } finally { cv.remove(); }
  }
  g.fillStyle = "#f2a93b";
  ["Reference", "A: three.js", "B: shader"].forEach((t, row) => g.fillText(t, 6, PAD + row * S + S - 8));
  return out;
}
$("sheet").onclick = async () => {
  const out = await comparisonSheet();
  const a = document.createElement("a");
  a.href = out.toDataURL("image/png");
  a.download = "light-lab-spike-comparison.png";
  a.click();
};

window.__spike = () => current;   // for debugging from the console only
window.__sheet = comparisonSheet;

(async () => {
  ui.cand.value = "b";
  await useCandidate("b");
  loadPreset("p3_three");
  requestAnimationFrame(loop);
})();
