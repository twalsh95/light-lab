// Scene description (brief 3.1): plain language from the setup and from the measured picture.
// It's the accessibility feature (a screen reader announces it as things change) and a
// learning feature (students compare what they see with what the words say).
import { ROLES } from "../scene/schema.js";
import { fixture, modifier } from "../scene/gear.js";
import { resolveLights, coneFactor, shutterFactor, sub, dot, cameraSettings, meterFace } from "../scene/lightmath.js";
import { meterStops } from "../scene/camera.js";

function sideWords(az) {
  const a = Math.abs(az);
  if (a < 15) return "in front, near the camera";
  const side = az < 0 ? "camera-left" : "camera-right";
  if (a > 150) return "behind the subject";
  if (a > 100) return `behind on the ${side}`;
  if (a > 70) return `to the side, ${side}`;
  return `on the ${side}`;
}
const heightWords = (el) => (el > 50 ? "high above" : el > 20 ? "high" : el > -10 ? "at about eye level" : "low, shining up");
function softness(L) {
  const d = Math.hypot(...L.position), tanA = L.size / 2 / d;
  return tanA > 0.25 ? "very soft" : tanA > 0.12 ? "soft" : tanA > 0.05 ? "fairly hard" : "hard";
}
// Light from one light at the face (facing it), for "brighter/dimmer than the key".
function lightAtFace(L) {
  const toL = sub(L.position, [0, 0, 0]), d2 = dot(toL, toL);
  return (L.intensity / d2) * coneFactor(L, sub([0, 0, 0], L.position)) * shutterFactor(L, [0, 0, 0]);
}

export function describe(state, metrics) {
  const out = [];
  const resolved = resolveLights(state), byId = Object.fromEntries(resolved.map((L) => [L.id, L]));
  const key = resolved.find((L) => L.role === "key") || resolved.filter((L) => L.role !== "backdrop" && L.role !== "reflector").sort((a, b) => lightAtFace(b) - lightAtFace(a))[0];
  const keyE = key ? lightAtFace(key) : 0;

  if (!state.lights.some((l) => l.on)) out.push("All the lights are off.");
  for (const l of state.lights) {
    const role = ROLES[l.role].label, f = fixture(l.fixture), m = modifier(l.modifier);
    if (!l.on) { out.push(`The ${role.toLowerCase()} is off.`); continue; }
    const L = byId[l.id];
    if (!L) { out.push(`The ${role.toLowerCase()} can't reach the subject (it's behind the backdrop).`); continue; }
    if (l.role === "backdrop") { out.push(`A backdrop light (${f.short}) shines on the backdrop from behind the subject.`); continue; }
    let bright = "";
    if (L !== key && keyE > 0) {
      const stops = Math.log2(keyE / Math.max(1e-9, lightAtFace(L)));
      bright = Math.abs(stops) < 0.35 ? ", about as bright as the key" : stops > 0 ? `, about ${stops.toFixed(1)} stops dimmer than the key` : `, ${(-stops).toFixed(1)} stops brighter than the key`;
    }
    const aim = l.aim?.at === "backdrop" ? ", aimed at the backdrop" : (l.aim?.panDeg || l.aim?.tiltDeg) ? ", turned slightly off the face" : "";
    // "a CB60 RGB in a CB60 softbox"; panels, Fresnels and bare bulbs need no modifier words.
    const kit = ["panel-bare", "fresnel-lens", "any-size", "bare-bulb"].includes(l.modifier) ? `a ${f.short}` : `a ${f.short} with a ${m.name.replace(/^(Standard|White|Silver|Gold)/, (w) => w.toLowerCase())}`;
    out.push(`${role} ${sideWords(l.azimuthDeg)}, ${heightWords(l.elevationDeg)}, ${l.distance.toFixed(1)} m away: ${softness(L)} light from ${kit}${bright}${aim}.`);
  }
  for (const r of state.reflectors) out.push(`A ${r.side} reflector ${sideWords(r.azimuthDeg)} bounces light back.`);

  if (metrics) {
    const s = metrics.shadowStops;
    const shadow = s < 0.4 ? "There's almost no shadow side: the light is even." : s < 1 ? "The shadow side is softly darker." :
      s < 2 ? "The shadow side is clearly darker." : s < 3 ? "The shadow side is much darker: strong shadows." : "The shadow side falls into deep, dramatic shadow.";
    out.push(`${shadow} (about ${s.toFixed(1)} stops)`);
    out.push(`The brightest side of the face is picture-${metrics.keySide}.`);
    out.push(`The backdrop looks ${metrics.backdropMean < 0.12 ? "dark" : metrics.backdropMean < 0.6 ? "grey" : "bright"}.`);
    if (state.lights.some((l) => l.on && (l.role === "back" || l.role === "hair")) && metrics.rimScore > -0.1) out.push("A rim of light outlines the head.");
    if (metrics.colorCast > 0.25) out.push("The light looks warm (orange) to the camera.");
    else if (metrics.colorCast < -0.25) out.push("The light looks cool (blue) to the camera.");
    if (metrics.tintCast > 0.25) out.push("There's a green tint.");
    else if (metrics.tintCast < -0.25) out.push("There's a magenta tint.");
  }
  const ms = meterStops(cameraSettings(state), meterFace(state));
  if (ms < -0.7) out.push(`The picture is ${(-ms).toFixed(1)} stops darker than correct exposure.`);
  else if (ms > 0.7) out.push(`The picture is ${ms.toFixed(1)} stops brighter than correct exposure.`);
  return out;
}
