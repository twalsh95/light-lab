// Camera bar under the portrait: Auto or Manual, aperture, shutter speed, ISO, and a meter
// scale like the one in a camera's viewfinder.
//   Auto: the camera picks all three (shown greyed). Exposure compensation brightens or darkens.
//   Manual: the student picks all three; the meter shows how far from "correct" they are.
import { SHUTTERS, ISOS, apertureLabel, shutterLabel, isoLabel, meterStops, aperturesFor } from "../scene/camera.js";
import { cameraSettings, meterFace } from "../scene/lightmath.js";
import { cameraGear } from "../scene/gear.js";
import { h } from "./panels.js";

const thirds = (v) => {
  const r = Math.round(v * 3) / 3, whole = Math.trunc(r), frac = Math.round(Math.abs(r - whole) * 3);
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  const f = frac === 1 ? "⅓" : frac === 2 ? "⅔" : "";
  return sign + (Math.abs(whole) || !f ? Math.abs(whole) : "") + f;
};

export function createCameraBar(el, history, { announce }) {
  const change = (fn, group) => history.change(fn, group);
  const modeAuto = h("button", { type: "button", role: "radio", class: "seg small", onclick: () => setMode("auto") }, "Auto");
  const modeManual = h("button", { type: "button", role: "radio", class: "seg small", onclick: () => setMode("manual") }, "Manual");
  const mk = (label, key, hint) => {
    const sel = h("select", { "data-key": key, "aria-label": label, title: hint });
    return { sel, wrap: h("label", { class: "cam-field", title: hint }, h("span", { class: "cam-label" }, label), sel) };
  };
  const ap = mk("Aperture", "aperture", "How wide the lens opens. Lower f-numbers let in more light and blur the backdrop more.");
  const sh = mk("Shutter", "shutter", "How long the shutter stays open. Longer lets in more light. (The subject is still, so there's no motion blur here.)");
  const iso = mk("ISO", "iso", "How sensitive the sensor is. Higher is brighter but adds grain.");
  const ev = mk("Exp. comp.", "ev", "Auto only: brighter (+) or darker (−) than the camera would choose.");
  for (let v = -3; v <= 3.001; v += 1 / 3) ev.sel.append(h("option", { value: v.toFixed(2) }, thirds(v) === "" ? "0" : thirds(v)));
  const meter = h("div", { class: "meter", role: "img" });
  const scale = h("div", { class: "meter-scale" });
  for (let i = -3; i <= 3; i++) scale.append(h("span", { class: "tick" + (i === 0 ? " zero" : "") }, i === 0 ? "0" : (i > 0 ? "+" : "−") + Math.abs(i)));
  const needle = h("span", { class: "meter-needle" });
  const meterText = h("p", { class: "meter-text", "aria-live": "polite" });
  meter.append(scale, needle);
  el.append(
    h("div", { class: "cam-row" }, h("div", { class: "group", role: "radiogroup", "aria-label": "Exposure mode" }, modeAuto, modeManual), ap.wrap, sh.wrap, iso.wrap, ev.wrap),
    h("div", { class: "cam-meter" }, meter, meterText));

  let listSig = "";
  function fillLists(s) {
    const { body, lens, focal } = cameraGear(s);
    const sig = s.camera.body + s.camera.lens + focal;
    if (sig === listSig) return;
    listSig = sig;
    const fill = (sel, values, label) => { sel.innerHTML = ""; for (const v of values) sel.append(h("option", { value: String(v) }, label(v))); };
    fill(ap.sel, aperturesFor(lens, focal), (a) => apertureLabel(a, lens.tStop));
    fill(sh.sel, SHUTTERS.filter((t) => t <= body.shutter[0] && t >= body.shutter[1]), shutterLabel);
    fill(iso.sel, ISOS.filter((i) => i >= body.iso[0] && i <= body.iso[1]), isoLabel);
  }
  // Switching to Manual starts from what Auto was using, so the picture doesn't jump.
  function setMode(m) {
    const s = history.state;
    if (s.camera.mode === m) return;
    const cur = cameraSettings(s);
    change((st) => { st.camera.mode = m; if (m === "manual") Object.assign(st.camera, cur); });
    announce(m === "manual" ? "Manual: you set aperture, shutter and ISO. The meter shows if the picture is too bright or too dark." : "Auto: the camera sets aperture, shutter and ISO.");
  }
  ap.sel.addEventListener("change", () => change((s) => { s.camera.aperture = +ap.sel.value; }));
  sh.sel.addEventListener("change", () => change((s) => { s.camera.shutter = +sh.sel.value; }));
  iso.sel.addEventListener("change", () => change((s) => { s.camera.iso = +iso.sel.value; }));
  ev.sel.addEventListener("change", () => change((s) => { s.camera.evCompensation = Math.round(+ev.sel.value * 3) / 3; }));

  return {
    update(s) {
      fillLists(s);
      const manual = s.camera.mode === "manual", cur = cameraSettings(s);
      modeAuto.setAttribute("aria-checked", manual ? "false" : "true");
      modeManual.setAttribute("aria-checked", manual ? "true" : "false");
      const pick = (sel, v) => { const opts = [...sel.options].map((o) => +o.value); let best = opts[0], d = Infinity; for (const x of opts) { const e = Math.abs(Math.log2(x) - Math.log2(v)); if (e < d) { d = e; best = x; } } sel.value = String(best); };
      pick(ap.sel, cur.aperture); pick(sh.sel, cur.shutter); pick(iso.sel, cur.iso);
      for (const f of [ap, sh, iso]) { f.sel.disabled = !manual; f.wrap.classList.toggle("auto", !manual); }
      // A manual lens's aperture ring works in Auto too: the camera can't set it.
      const ring = !!cameraGear(s).lens.manualAperture;
      if (ring) { ap.sel.disabled = false; ap.wrap.classList.remove("auto"); }
      ap.wrap.querySelector(".cam-label").textContent = ring ? "Aperture (ring)" : "Aperture";
      ev.wrap.hidden = manual;
      const evv = s.camera.evCompensation || 0;
      [...ev.sel.options].forEach((o) => { if (Math.abs(+o.value - evv) < 0.01) ev.sel.value = o.value; });
      // Meter: stops away from what a light meter at the face would call correct.
      const stops = meterStops(cur, meterFace(s));
      const shown = Math.max(-3.2, Math.min(3.2, stops));
      needle.style.left = `${((shown + 3.5) / 7) * 100}%`;
      meter.classList.toggle("off-scale", Math.abs(stops) > 3);
      const word = Math.abs(stops) < 1 / 6 ? "correct exposure" : stops > 0 ? "brighter than the meter says" : "darker than the meter says";
      const label = Math.abs(stops) < 1 / 6 ? "0" : thirds(Math.max(-9, Math.min(9, stops)));
      const g = cameraGear(s);
      let note = `${apertureLabel(cur.aperture, g.lens.tStop)}, ${shutterLabel(cur.shutter)} s, ISO ${cur.iso}. Meter: ${label} (${word}).`;
      if (!manual && ring) note += " Manual lens: you set the aperture on its ring; the camera picks shutter and ISO.";
      if (!manual && stops < -0.5 - Math.abs(evv) && stops < evv - 0.4) note += " Too dark for Auto: add light, open the aperture, or use Manual with a slower shutter or higher ISO.";
      if (!manual && stops > 0.5 + Math.abs(evv) && stops > evv + 0.4) note += " Too bright: even the fastest shutter can't cut it enough. Close the aperture or turn the lights down.";
      meterText.textContent = note;
      meter.setAttribute("aria-label", `Light meter: ${label} stops, ${word}`);
    },
  };
}
