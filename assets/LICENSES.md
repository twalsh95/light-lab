# Asset and library licenses

Every third-party file in this repo, where it came from, and its license.

## Libraries (in `vendor/`, copied unchanged)

| Library | Version | Source | License | Used by |
|---|---|---|---|---|
| three.js (`three.module.js`, `three.core.js`, `examples/jsm/postprocessing/Pass.js`) | 0.187.0 (Oct 30 2026) | npm `three` via cdn.jsdelivr.net | MIT, © 2010-2026 three.js authors (`vendor/three/LICENSE`) | the 3D studio view (src/ui/studio3d.js); spike candidates A and C |
| three-mesh-bvh | 0.9.17 (Oct 28 2026) | npm `three-mesh-bvh` via cdn.jsdelivr.net | MIT, © 2018 Garrett Johnson (`vendor/three-mesh-bvh/LICENSE`) | spike candidate C |
| three-gpu-pathtracer | 0.0.28 (Nov 2 2026) | npm `three-gpu-pathtracer` via cdn.jsdelivr.net | MIT, © 2021 Garrett Johnson (`vendor/three-gpu-pathtracer/LICENSE`) | spike candidate C |

## Models, textures, images

| File | Source | Rights |
|---|---|---|
| `docs/light-lab-reference/*.jpg` | Rendered by `render_prototype.py` (Tom Walsh's prototype) | Tom's own renders. No people. |
| Clay head (spike) | Generated in code from the prototype's proportions | Original, no external asset |
