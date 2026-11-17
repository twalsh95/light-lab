// The camera: aperture, shutter speed and ISO, in Auto or Manual.
//
// Exposure uses the real photographic relationship. A meter reading the light falling on
// the face (incident metering, calibration constant C = 250) says the correct exposure is
//   N² / t = lux × ISO / 250
// (N = f-number, t = shutter time in seconds). The scene's light units are 10,000 lux at
// 1 m, so the numbers students see are the ones a real camera in the room would need.
import { SKIN } from "./head.js";

const LUX_UNIT = 10000, C = 250;
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Third-stop scales, as on real cameras.
export const APERTURES = [1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32, 36, 40, 45];
export const SHUTTERS = [30, 25, 20, 15, 13, 10, 8, 6, 5, 4, 3.2, 2.5, 2, 1.6, 1.3, 1, 0.8, 0.6, 0.5, 0.4, 0.3,
  1 / 4, 1 / 5, 1 / 6, 1 / 8, 1 / 10, 1 / 13, 1 / 15, 1 / 20, 1 / 25, 1 / 30, 1 / 40, 1 / 50, 1 / 60, 1 / 80, 1 / 100, 1 / 125, 1 / 160,
  1 / 200, 1 / 250, 1 / 320, 1 / 400, 1 / 500, 1 / 640, 1 / 800, 1 / 1000, 1 / 1250, 1 / 1600, 1 / 2000, 1 / 2500, 1 / 3200, 1 / 4000];
export const ISOS = [100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400];

export const apertureLabel = (n, tStop = false) => (tStop ? "T" : "f/") + (n < 10 && n % 1 ? n.toFixed(1) : String(Math.round(n * 10) / 10));

// A zoom's widest and smallest apertures change as it zooms (e.g. f/3.5 at 18 mm, f/5.6 at
// 55 mm). Interpolated on a log scale between the two ends, as zoom lenses step.
export function lensLimits(lens, focal) {
  const [f0, f1] = lens.focal;
  const t = f1 > f0 ? Math.log(focal / f0) / Math.log(f1 / f0) : 0;
  const mix = ([a, b]) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * Math.max(0, Math.min(1, t)));
  return { widest: Math.round(mix(lens.maxAperture) * 10) / 10, smallest: mix(lens.minAperture) };
}
// The aperture settings this lens offers at this focal length.
export function aperturesFor(lens, focal) {
  const { widest, smallest } = lensLimits(lens, focal);
  return [widest, ...APERTURES.filter((a) => a > widest * 1.04 && a <= smallest * 1.02)];
}
export function shutterLabel(t) {
  if (t >= 0.3) return (t % 1 ? t.toFixed(1) : String(t)) + '"';
  return "1/" + Math.round(1 / t);
}
export const isoLabel = (i) => "ISO " + i;

// Nearest value on a scale, measured in stops.
export function snap(list, v) {
  let best = list[0], d = Infinity;
  for (const x of list) { const e = Math.abs(Math.log2(x) - Math.log2(v)); if (e < d) { d = e; best = x; } }
  return best;
}

// Display multiplier for these settings. It's independent of the light: brighter light
// just needs different settings, exactly as with a real camera.
export function exposureFromSettings({ aperture, shutter, iso }) {
  return ((0.8 * LUX_UNIT) / C) * (iso * shutter) / (aperture * aperture * lum(SKIN.albedo));
}

// Auto ("program") mode, the way a camera on Auto behaves in a studio: start at f/5.6 and
// ISO 100; if that needs a shutter slower than 1/30 s, open the aperture, then raise ISO
// up to 1600 (the auto-ISO limit), and past that it simply underexposes, so a dark studio
// still looks dark. Too much light: stop down, then use a faster shutter.
export const AUTO = { startAperture: 5.6, slowest: 1 / 30, maxIso: 1600 };
export function autoSettings(meterE, evComp = 0, apertures = APERTURES.filter((a) => a >= 1.8 && a <= 22), isoRange = [100, 6400]) {
  const lux = Math.max(1e-3, meterE * LUX_UNIT) / Math.pow(2, evComp);   // +EV = brighter = as if less light
  const wide = apertures[0], narrow = apertures[apertures.length - 1];
  let N = Math.min(narrow, Math.max(wide, AUTO.startAperture)), iso = 100;
  let t = (N * N * C) / (lux * iso);
  if (t > AUTO.slowest) { N = Math.max(wide, Math.sqrt((AUTO.slowest * lux * iso) / C)); t = (N * N * C) / (lux * iso); }
  if (t > AUTO.slowest) { iso = Math.min(AUTO.maxIso, (N * N * C) / (lux * AUTO.slowest)); t = (N * N * C) / (lux * iso); }
  t = Math.min(t, AUTO.slowest);
  if (t < 1 / 4000) { N = Math.min(narrow, Math.sqrt((lux * iso) / (C * 4000))); t = Math.max(1 / 4000, (N * N * C) / (lux * iso)); }
  // Round aperture and ISO to their marked steps first, then pick the shutter to match, so the
  // total stays within a sixth of a stop of the meter (as a real camera does).
  const aperture = snap(apertures, N);
  // If the rounded aperture now needs a shutter slower than the limit, raise ISO to the next
  // marked step that covers it (up to the auto-ISO limit).
  const needIso = (aperture * aperture * C) / (lux * AUTO.slowest);
  const isoList = ISOS.filter((x) => x >= isoRange[0] && x <= Math.min(isoRange[1], AUTO.maxIso));
  let isoS = snap(isoList, iso);
  if (needIso > isoS) isoS = isoList.find((x) => x >= needIso) || isoList[isoList.length - 1];
  const tExact = Math.min(AUTO.slowest, Math.max(1 / 4000, (aperture * aperture * C) / (lux * isoS)));
  return { aperture, shutter: snap(SHUTTERS, tExact), iso: isoS };
}

// How far these settings are from what the meter says, in stops (+ = brighter than the
// meter, - = darker). A real camera shows this as the needle or scale in the viewfinder.
export function meterStops(settings, meterE) {
  const ideal = 0.8 / (Math.max(1e-6, meterE) * lum(SKIN.albedo));
  return Math.log2(exposureFromSettings(settings) / ideal);
}
