import { HEAD } from "../scene/head.js";

// Measurable properties of a portrait (brief section 5.2). These drive Name the setup,
// Match the look scoring, and the scene description. They're computed from pixels, the same
// way for the live renders and for Tom's reference JPEGs, so one classifier works for both.
//
// Input: a frame of linear brightness values already scaled by the camera's exposure (so 1.0
// is "white" on screen; values can exceed 1), plus masks for the subject and the face.
//
//   faceMean      mean brightness of the face (as shown, so clipped at 1)
//   shadowStops   log2(lit half / shadow half) of the face, split at the nose line.
//                 The main high-key / low-key signal.
//   backdropMean  mean brightness of the backdrop (as shown)
//   rimScore      log2(silhouette edge / just inside it): positive = a rim of light
//   keySide       "left" or "right" in the picture (camera-left is picture-left)
//   overallMean   mean brightness of the whole frame (as shown)
//   colorCast     warmth of the face: + = orange, - = blue (about -1..1)
//   tintCast      + = green, - = magenta
export function computeMetrics({ w, h, rgb, subject, face, noseX }) {
  const lumAt = (k) => 0.2126 * rgb[k * 3] + 0.7152 * rgb[k * 3 + 1] + 0.0722 * rgb[k * 3 + 2];
  const shown = (v) => Math.min(1, v);
  let faceSum = 0, faceN = 0, leftSum = 0, leftN = 0, rightSum = 0, rightN = 0;
  let bdSum = 0, bdN = 0, allSum = 0;
  let r = 0, g = 0, b = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = y * w + x, L = lumAt(k);
    allSum += shown(L);
    if (!subject[k]) { bdSum += shown(L); bdN++; continue; }
    if (!face[k]) continue;
    faceSum += shown(L); faceN++;
    r += rgb[k * 3]; g += rgb[k * 3 + 1]; b += rgb[k * 3 + 2];
    // Leave a narrow band at the nose line out of both halves.
    if (x < noseX - 1) { leftSum += L; leftN++; } else if (x > noseX + 1) { rightSum += L; rightN++; }
  }
  const left = leftN ? leftSum / leftN : 0, right = rightN ? rightSum / rightN : 0;
  const lit = Math.max(left, right), dark = Math.min(left, right);
  const eps = 0.002;   // keeps a pitch-black side finite: about 9 stops below "white"

  // Rim: subject pixels on the silhouette edge, against those 3-5 pixels inside it.
  const dist = edgeDistance(w, h, subject);
  let edgeSum = 0, edgeN = 0, inSum = 0, inN = 0;
  for (let k = 0; k < w * h; k++) {
    if (!subject[k]) continue;
    const d = dist[k];
    if (d <= 1) { edgeSum += lumAt(k); edgeN++; } else if (d >= 3 && d <= 5) { inSum += lumAt(k); inN++; }
  }
  const sumC = r + g + b || 1;
  return {
    faceMean: faceN ? faceSum / faceN : 0,
    shadowStops: Math.log2((lit + eps) / (dark + eps)),
    backdropMean: bdN ? bdSum / bdN : 0,
    rimScore: edgeN && inN ? Math.log2((edgeSum / edgeN + eps) / (inSum / inN + eps)) : 0,
    keySide: left >= right ? "left" : "right",
    overallMean: allSum / (w * h),
    colorCast: (r - b) / sumC * 3,
    tintCast: (g - (r + b) / 2) / sumC * 3,
  };
}

// For each subject pixel, how many pixels to the nearest non-subject pixel (up to 8).
function edgeDistance(w, h, subject) {
  const d = new Uint8Array(w * h).fill(255);
  for (let k = 0; k < w * h; k++) if (!subject[k]) d[k] = 0;
  for (let pass = 0; pass < 8; pass++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (d[k] === 0) continue;
      let m = d[k];
      if (x > 0) m = Math.min(m, d[k - 1] + 1);
      if (x < w - 1) m = Math.min(m, d[k + 1] + 1);
      if (y > 0) m = Math.min(m, d[k - w] + 1);
      if (y < h - 1) m = Math.min(m, d[k + w] + 1);
      d[k] = m;
    }
  }
  return d;
}

// ---------- Tom's reference renders (render_prototype.py) ----------
// The prototype draws the head straight on (no perspective), x from -1.5 to 1.5 and y from
// 1.3 down to -1.7 across the 900 px frame, with ellipses for head, neck and shoulders. That
// gives exact masks for the JPEGs. Its pixel values are linear brightness (no gamma curve).

export function referenceMasks(w, h) {
  const subject = new Uint8Array(w * h), face = new Uint8Array(w * h);
  const inside = (x, y, { c, r }) => ((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 < 1;
  for (let j = 0; j < h; j++) {
    const y = 1.3 - 3 * ((j + 0.5) / h);
    for (let i = 0; i < w; i++) {
      const x = -1.5 + 3 * ((i + 0.5) / w), k = j * w + i;
      const head = inside(x, y, HEAD.head);
      if (head || inside(x, y, HEAD.neck) || inside(x, y, HEAD.shoulders)) subject[k] = 1;
      // The face: the head above the jaw, inset a little from the outline.
      if (head && y > -0.45 && inside(x, y, { c: HEAD.head.c, r: [HEAD.head.r[0] * 0.9, HEAD.head.r[1] * 0.92] })) face[k] = 1;
    }
  }
  return { subject, face, noseX: Math.floor(w / 2) };
}

// Metrics for a reference JPEG (an <img> that has loaded), sampled down to `size` pixels.
export function referenceMetrics(img, size = 150) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0, size, size);
  const px = g.getImageData(0, 0, size, size).data, rgb = new Float32Array(size * size * 3);
  for (let k = 0; k < size * size; k++) for (let ch = 0; ch < 3; ch++) rgb[k * 3 + ch] = px[k * 4 + ch] / 255;
  return computeMetrics({ w: size, h: size, rgb, ...referenceMasks(size, size) });
}
