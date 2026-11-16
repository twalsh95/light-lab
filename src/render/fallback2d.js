// Simple 2D view for devices without WebGL 2. It works the way the prototype did: the head
// is a height map seen straight on, shaded per pixel on the CPU at low resolution, with
// blurred shadows. Fewer details than the 3D view, but the same lights and the same rules:
// falloff with distance, light size sets shadow softness, fill lifts the shadow side.
import { HEAD, UNIT, SKIN, featureHeight } from "../scene/head.js";
import { resolveLights, exposureFor, coneFactor, hexToRGB, norm, sub, dot } from "../scene/lightmath.js";

const N = 128;
const X0 = -1.5, X1 = 1.5, Y0 = 1.3, Y1 = -1.7;           // prototype framing, in head units
const PX = (X1 - X0) / (N - 1);                           // units per pixel

function buildHeightField() {
  const H = new Float32Array(N * N);
  const ell = (x, y, { c, r }) => { const v = 1 - ((x - c[0]) / r[0]) ** 2 - ((y - c[1]) / r[1]) ** 2; return v > 0 ? r[2] * Math.sqrt(v) : 0; };
  for (let j = 0; j < N; j++) {
    const y = Y0 + (Y1 - Y0) * (j / (N - 1));
    for (let i = 0; i < N; i++) {
      const x = X0 + PX * i;
      const head = ell(x, y, HEAD.head);
      let h = Math.max(head, ell(x, y, HEAD.neck), ell(x, y, HEAD.shoulders));
      if (head > 0) h += featureHeight(x, y);
      H[j * N + i] = h;
    }
  }
  const mask = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) mask[k] = H[k] > 0.005 ? 1 : 0;
  const Hs = blur(H, 1);
  const nx = new Float32Array(N * N), ny = new Float32Array(N * N), nz = new Float32Array(N * N);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i;
    const dx = (Hs[k + 1] - Hs[k - 1]) / (2 * PX), dy = (Hs[k - N] - Hs[k + N]) / (2 * PX);
    const l = Math.hypot(dx, dy, 1);
    nx[k] = -dx / l; ny[k] = -dy / l; nz[k] = 1 / l;
  }
  return { H: Hs, mask, nx, ny, nz };
}

// Separable box blur, radius in pixels (run twice it looks close to a Gaussian).
function blur(src, r) {
  if (r < 1) return src;
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  const pass = (a, b, horiz) => {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let o = -r; o <= r; o++) {
        const ii = horiz ? i + o : i, jj = horiz ? j : j + o;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        s += a[jj * N + ii]; n++;
      }
      b[j * N + i] = s / n;
    }
  };
  pass(src, tmp, true); pass(tmp, out, false);
  pass(out, tmp, true); pass(tmp, out, false);
  return out;
}

export function createFallbackRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device can't draw the studio.");
  const field = buildHeightField();
  const small = document.createElement("canvas");
  small.width = small.height = N;
  const sctx = small.getContext("2d");
  const img = sctx.createImageData(N, N);

  return {
    kind: "2d",
    lost: false,
    warm() {},
    render(state, _level, cssSize) {
      const px = Math.round(cssSize * Math.min(2, window.devicePixelRatio || 1));
      if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
      const { H, mask, nx, ny, nz } = field;
      const lights = resolveLights(state);
      const R = new Float32Array(N * N), G = new Float32Array(N * N), B = new Float32Array(N * N);
      const amb = state.room.ambient;
      const bc = hexToRGB(state.backdrop.color).map((c) => c * state.backdrop.brightness);
      const zb = -state.backdrop.distance;

      for (const L of lights) {
        const toL = norm(L.position);                          // from the face toward the light
        const d = Math.hypot(...L.position);
        const tanA = Math.max(0.004, (L.size / 2) / d);
        // Shadow on the subject: march across the height field toward the light.
        let sh = new Float32Array(N * N).fill(1);
        if (L.shadow && L.role !== "backdrop") {
          const lz = Math.max(toL[2], 0.2);
          for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const k = j * N + i;
            if (!mask[k]) continue;
            for (let s = 1; s <= 24; s++) {
              const dist = s * 0.05;                             // head units along the ray
              const ii = Math.round(i + (toL[0] / lz) * dist / PX), jj = Math.round(j - (toL[1] / lz) * dist / PX);
              if (ii < 0 || jj < 0 || ii >= N || jj >= N) break;
              if (H[jj * N + ii] > H[k] + dist * 0.9) { sh[k] = 0; break; }
            }
          }
          // Softness from the light's size: bigger or closer = wider blur.
          sh = blur(sh, Math.round(Math.min(8, 1 + tanA * 40)));
        }
        // Shadow of the subject on the backdrop (only for lights in front of the subject).
        let wall = null;
        if (L.shadow && toL[2] > 0.15) {
          const gap = state.backdrop.distance / UNIT;            // head-to-backdrop, head units
          const ox = Math.round((-toL[0] / toL[2]) * gap / PX), oy = Math.round((toL[1] / toL[2]) * gap / PX);
          const m = new Float32Array(N * N);
          for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const si = i - ox, sj = j - oy;
            if (si >= 0 && sj >= 0 && si < N && sj < N && mask[sj * N + si]) m[j * N + i] = 1;
          }
          wall = blur(m, Math.round(Math.min(14, 2 + tanA * gap * 2)));
        }
        const col = L.color.map((c) => c * L.intensity);
        for (let j = 0; j < N; j++) {
          const y = (Y0 + (Y1 - Y0) * (j / (N - 1))) * UNIT;
          for (let i = 0; i < N; i++) {
            const k = j * N + i, x = (X0 + PX * i) * UNIT;
            let e;
            if (mask[k]) {
              const p = [x, y, H[k] * UNIT];
              const v = sub(L.position, p), d2 = dot(v, v), l = norm(v);
              const wrap = Math.min(0.35, tanA * 0.6);
              const ndl = Math.max(0, (nx[k] * l[0] + ny[k] * l[1] + nz[k] * l[2] + wrap) / (1 + wrap));
              e = (ndl * coneFactor(L, sub(p, L.position)) * sh[k]) / d2;
              e *= SKIN.albedo[1];
            } else {
              const p = [x * (2.2 - zb) / 2.2, y, zb];
              const v = sub(L.position, p), d2 = dot(v, v), l = norm(v);
              e = (Math.max(0, l[2]) * coneFactor(L, sub(p, L.position)) / d2) * (wall ? 1 - 0.9 * wall[k] : 1);
              e *= bc[1];
            }
            R[k] += e * col[0]; G[k] += e * col[1]; B[k] += e * col[2];
          }
        }
      }
      const ex = exposureFor(state);
      const skinTint = SKIN.albedo.map((a) => a / SKIN.albedo[1]);
      const bdTint = bc[1] > 0 ? bc.map((a) => a / bc[1]) : [1, 1, 1];
      for (let k = 0; k < N * N; k++) {
        const t = mask[k] ? skinTint : bdTint;
        const a = mask[k] ? SKIN.albedo[1] : bc[1];
        const o = k * 4;
        img.data[o]     = 255 * Math.min(1, ex * (R[k] * t[0] + amb * a * t[0]));
        img.data[o + 1] = 255 * Math.min(1, ex * (G[k] * t[1] + amb * a * t[1]));
        img.data[o + 2] = 255 * Math.min(1, ex * (B[k] * t[2] + amb * a * t[2]));
        img.data[o + 3] = 255;
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(small, 0, 0, px, px);
      return 0;
    },
  };
}
