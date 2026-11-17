// Snapshot: the portrait, the lighting diagram and the settings on one page, saved as a
// PNG or a one-page PDF (for Google Classroom). Made entirely in the browser.
import { ROLES } from "../scene/schema.js";
import { gear, fixture, modifier, reflectorItem } from "../scene/gear.js";
import { lightSpec, mapPoint, backdropLightPosition, lightAim, lightPosition, cameraSettings } from "../scene/lightmath.js";
import { apertureLabel, shutterLabel } from "../scene/camera.js";
import { SHAPE_PATHS, MAP_VIEW } from "./map.js";

const W = 1650, H = 1275;   // US Letter, landscape, at 150 dpi
const C = { ink: "#0e0f12", text: "#14161a", muted: "#555b66", line: "#c9ccd3", key: "#d98a12", fill: "#2a7fc4", back: "#d6453d", hair: "#b0459a", accent: "#2f9a52", backdrop: "#7a808c", reflector: "#a07c2c" };

function sideText(az) {
  if (Math.abs(az) < 8) return "beside the camera";
  if (Math.abs(az) > 172) return "behind the subject";
  return `${Math.round(Math.abs(az))}° ${az < 0 ? "camera-left" : "camera-right"}`;
}
export function settingsLines(s) {
  const G = gear(), lines = [];
  lines.push(s.mode === "room" ? "Room mode (our real gear)" : "Open studio");
  const n = {};
  for (const l of s.lights) {
    const spec = lightSpec(l, s), f = fixture(l.fixture), m = modifier(l.modifier);
    const label = ROLES[l.role].letter + (s.lights.filter((x) => x.role === l.role).length > 1 ? (n[l.role] = (n[l.role] || 0) + 1) : "");
    const where = l.role === "backdrop" ? "behind the subject, aimed at the backdrop" : `${sideText(l.azimuthDeg)}, ${Math.round(l.elevationDeg)}° up, ${l.distance.toFixed(1)} m`;
    const colour = f.rgb && l.color.mode === "rgb" ? `colour ${Math.round(l.color.hue)}°` : `${f.kelvin[0] === f.kelvin[1] ? f.kelvin[0] : l.kelvin} K`;
    const extras = [];
    if (f.beamDeg) extras.push(`${Math.round(l.flood * 100)}% flood`);
    if (m.gels && l.gel !== "none") extras.push(G.gels[l.gel].name.toLowerCase());
    if (m.gobo) extras.push(`${G.gobos[l.gobo].name.toLowerCase()} gobo`);
    if (l.flag) extras.push(`black flag on the ${l.flag.side === "camera" || l.flag.side === "backdrop" ? l.flag.side + " side" : l.flag.side}`);
    if (Object.values(l.shutters).some((v) => v > 0) && f.barnDoors) extras.push("barn doors");
    if (l.role !== "backdrop" && l.aim?.at === "backdrop") extras.push("aimed at the backdrop");
    if (l.aim?.panDeg || l.aim?.tiltDeg) extras.push(`turned ${l.aim.panDeg || 0}°, tilted ${l.aim.tiltDeg || 0}°`);
    lines.push(`${label}  ${ROLES[l.role].label}${l.on ? "" : " (off)"}: ${f.short}, ${m.name} (${Math.round(spec.size * 100)} cm), ` +
      `${f.dimmable || s.mode !== "room" ? Math.round(l.power * 100) + "%" : "full"}, ${where}, ${colour}${extras.length ? ", " + extras.join(", ") : ""}`);
  }
  for (const r of s.reflectors) lines.push(`R  Reflector: ${reflectorItem(r.item).sides[r.side].name.toLowerCase()}, ${sideText(r.azimuthDeg)}, ${r.distance.toFixed(1)} m`);
  if (!s.lights.length) lines.push("No lights.");
  const bd = s.backdrop.type === "custom" ? `grey ${Math.round(s.backdrop.brightness * 100)}%` : G.backdrops[s.backdrop.type].name.toLowerCase();
  lines.push(`Backdrop: ${bd}, ${s.backdrop.distance.toFixed(1)} m behind the subject`);
  lines.push(`Subject: ${G.skins[s.subject.skin].name.toLowerCase()} skin, ${G.clothing[s.subject.clothing].name.toLowerCase()}`);
  const cs = cameraSettings(s);
  lines.push(`Camera: ${s.camera.mode === "manual" ? "Manual" : "Auto"}, ${apertureLabel(cs.aperture)}, ${shutterLabel(cs.shutter)} s, ISO ${cs.iso}` +
    `${s.camera.mode !== "manual" && s.camera.evCompensation ? `, ${s.camera.evCompensation > 0 ? "+" : ""}${Math.round(s.camera.evCompensation * 10) / 10} EV` : ""}, ${s.camera.whiteBalance} white balance`);
  return lines;
}

export function drawDiagram(g, s, x0, y0, w, h) {
  const k = Math.min(w / MAP_VIEW.w, h / MAP_VIEW.h);
  const ox = x0 + (w - MAP_VIEW.w * k) / 2 - MAP_VIEW.x * k, oy = y0 + (h - MAP_VIEW.h * k) / 2 - MAP_VIEW.y * k;
  const P = (x, z) => [ox + x * k, oy + z * k];
  g.save();
  g.fillStyle = "#fff"; g.fillRect(x0, y0, w, h);
  g.strokeStyle = C.line; g.lineWidth = 1.5;
  g.strokeRect(x0, y0, w, h);
  for (const r of [1, 2]) { g.beginPath(); g.arc(...P(0, 0), r * k, 0, Math.PI * 2); g.stroke(); }
  g.font = "16px system-ui, sans-serif"; g.fillStyle = C.muted; g.textAlign = "center";
  g.fillText("1 m", ...P(0.18, -1.04)); g.fillText("2 m", ...P(0.18, -2.04));
  // Backdrop, subject, camera
  g.strokeStyle = "#333"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(...P(-2.4, -s.backdrop.distance)); g.lineTo(...P(2.4, -s.backdrop.distance)); g.stroke();
  g.fillText("Backdrop", ...P(0, -s.backdrop.distance - 0.1));
  g.fillStyle = "#bbb"; g.beginPath(); g.ellipse(...P(0, 0), 0.2 * k, 0.085 * k, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#888"; g.beginPath(); g.arc(...P(0, 0), 0.093 * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.muted; g.fillText("Subject", ...P(0, 0.4));
  g.fillStyle = "#666"; g.fillRect(...P(-0.16, 2.14), 0.32 * k, 0.2 * k);
  g.fillStyle = C.muted; g.fillText("Camera", ...P(0, 2.62));
  // Lights
  let bg = 0; const n = {};
  for (const l of s.lights) {
    const col = C[l.role] || C.key;
    let x, z;
    if (l.role === "backdrop") { const p = backdropLightPosition(s, bg++); x = p[0]; z = p[2]; } else ({ x, z } = mapPoint(l));
    if (l.role !== "backdrop") {
      const t = lightAim(l, s, lightPosition(l)), tx = t[0], tz = t[2];
      const size = lightSpec(l, s).size, ang = Math.atan2(tz - z, tx - x), px = -Math.sin(ang), pz = Math.cos(ang);
      g.globalAlpha = l.on ? 0.18 : 0.06; g.fillStyle = col;
      g.beginPath(); g.moveTo(...P(x + px * size / 2, z + pz * size / 2)); g.lineTo(...P(tx + px * 0.12, tz + pz * 0.12)); g.lineTo(...P(tx - px * 0.12, tz - pz * 0.12)); g.lineTo(...P(x - px * size / 2, z - pz * size / 2)); g.fill();
      g.globalAlpha = 1; g.strokeStyle = col; g.lineWidth = 5;
      g.beginPath(); g.moveTo(...P(x + px * size / 2, z + pz * size / 2)); g.lineTo(...P(x - px * size / 2, z - pz * size / 2)); g.stroke();
    }
    g.save(); g.translate(...P(x, z)); g.scale(k, k);
    const path = new Path2D(SHAPE_PATHS[l.role]);
    g.fillStyle = l.on ? col : "#fff"; g.fill(path);
    g.lineWidth = 0.03; g.strokeStyle = l.on ? "#111" : col; g.stroke(path);
    g.restore();
    const label = ROLES[l.role].letter + (s.lights.filter((y) => y.role === l.role).length > 1 ? (n[l.role] = (n[l.role] || 0) + 1) : "");
    g.fillStyle = l.on ? "#fff" : col; g.font = `bold ${label.length > 1 ? 15 : 20}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(label, ...P(x, z));
    g.textBaseline = "alphabetic";
  }
  for (const r of s.reflectors) {
    const { x, z } = mapPoint(r), item = reflectorItem(r.item);
    g.save(); g.translate(...P(x, z)); g.rotate(Math.atan2(-z, -x) + Math.PI / 2);
    g.fillStyle = r.side === "gold" ? "#d7a83c" : r.side === "silver" ? "#c0c4cc" : "#f4f4f4";
    g.strokeStyle = "#333"; g.lineWidth = 2;
    g.fillRect(-item.width / 2 * k, -0.05 * k, item.width * k, 0.1 * k); g.strokeRect(-item.width / 2 * k, -0.05 * k, item.width * k, 0.1 * k);
    g.restore();
    g.fillStyle = C.text; g.font = "bold 16px system-ui, sans-serif"; g.textAlign = "center"; g.fillText("R", ...P(x, z - 0.2));
  }
  g.restore();
}

function wrap(g, text, maxW) {
  const words = text.split(" "), out = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}

// portrait: a canvas holding the current camera view.
export function composeSnapshot(state, portrait) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.fillStyle = C.text; g.font = "bold 40px system-ui, sans-serif"; g.textAlign = "left";
  g.fillText("Light Lab snapshot", 60, 80);
  g.font = "22px system-ui, sans-serif"; g.fillStyle = C.muted;
  g.fillText(new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), 60, 116);
  g.fillText("Name: ______________________", W - 470, 80);
  const P = 760;
  g.drawImage(portrait, 60, 150, P, P);
  g.strokeStyle = C.line; g.lineWidth = 2; g.strokeRect(60, 150, P, P);
  g.font = "18px system-ui, sans-serif"; g.fillText("Camera view", 60, 150 + P + 26);
  drawDiagram(g, state, 870, 150, 720, 560);
  g.fillStyle = C.muted; g.fillText("Studio from above", 870, 150 + 560 + 26);
  // Settings
  g.fillStyle = C.text; g.font = "19px system-ui, sans-serif";
  let y = 770;
  for (const line of settingsLines(state)) for (const part of wrap(g, line, 720)) { if (y < H - 90) g.fillText(part, 870, y); y += 26; }
  g.fillStyle = C.muted; g.font = "16px system-ui, sans-serif";
  g.fillText("Light Lab, walshclassroom.com/light-lab. A simplified studio: real skin, hair and lights behave in more complicated ways.", 60, H - 40);
  return c;
}

// A one-page PDF holding the snapshot as a JPEG. No library: the format is simple enough.
export async function snapshotPdf(canvas) {
  const jpeg = new Uint8Array(await (await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92))).arrayBuffer());
  const pw = 792, ph = 612;   // Letter landscape, in points
  const enc = new TextEncoder();
  const parts = [], offsets = [];
  let length = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); length += b.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); push("\nendstream"); });
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  obj(6, () => push("<< /Title (Light Lab snapshot) /Creator (Light Lab) >>"));
  const xref = length;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}
