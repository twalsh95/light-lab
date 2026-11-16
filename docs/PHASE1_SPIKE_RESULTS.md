# Light Lab: Phase 1 rendering spike results

Nov 16 2026. Test page: `walshclassroom.com/light-lab/spike/`.

**Important:** Only one real device was measured (Tom's Windows laptop). No Chromebook was available, so the Chromebook numbers below are **estimates**, not measurements. The app will make up for this by checking its own speed while it runs (see "How the app handles not knowing").

## Measured: Tom's laptop

Intel integrated graphics (Core Ultra class, device ID 0x7D45), Chrome 157, Windows, screen 1536×864 at 1.25× scaling, view 560 px.

Every A and B run hit the 60 fps screen cap. The GPU time shows the real cost; a frame must stay under 16.7 ms for 60 fps, or 33 ms for 30 fps.

| Candidate | Quality | GPU ms, three-point | GPU ms, low-key |
|---|---|---|---|
| A: three.js shadow maps | low / medium / high | 1.11 / 2.01 / 3.85 | 0.56 / 0.90 / 1.59 |
| B: custom shader | low / medium / high | 0.98 / 2.05 / 3.48 | 0.66 / 1.37 / 2.30 |
| C: path-traced Develop | medium | 64 samples (a clean still) in 3.8 s | |

C's first run (low) took 55 s to show its first sample. That was the one-time shader build landing in that run. The benchmark now times setup separately, but that number wasn't re-measured.

## Estimated: school Chromebooks (not measured)

Assumptions, all estimates:
- Typical school Chromebooks from 2022–2026 use Intel N100/N200 or Celeron N4500 integrated graphics, or ARM chips with Mali-G52-class graphics.
- Those GPUs are roughly **5× (N100) to 12× (older Celeron, Mali)** slower than Tom's laptop.
- Chromebook screens are usually 1366×768 at 1× scaling, so about 35% fewer pixels to draw at the same view size. B's cost scales almost entirely with pixels; A's partly does.

| Candidate | Quality | Estimated GPU ms, three-point (N100 → weakest) | Smooth? |
|---|---|---|---|
| A | low | 5 → 11 | yes |
| A | medium | 8 → 20 | yes on N100; about 50 fps on the weakest |
| A | high | 16 → 38 | borderline to choppy |
| B | low | 3 → 8 | yes |
| B | medium | 7 → 16 | yes |
| B | high | 11 → 27 | yes on N100; 35–40 fps on the weakest |
| C | medium | setup: unknown, possibly a minute; 64 samples: about 20 → 45 s | fine as a wait-for-it button, if it doesn't crash |

**Least certain:** ARM (Mali) GPUs handle B's long per-pixel loops worse than this simple scaling assumes, and they're built for A's kind of drawing. On those devices the two could swap places.

## How the app handles not knowing
1. **It starts at Low** and steps up only while it stays smooth: it measures its own frame time during the first few seconds and while a light is dragged.
2. **It steps down automatically** if dragging drops below about 30 fps. Students can always override.
3. **It falls back to the 2D view** if WebGL 2 is missing or the 3D view fails, with a plain-language message.
4. **No C on start-up.** The path tracer loads only when someone presses Develop, so a slow or failing setup never blocks the studio.

## Comparison

| | A: three.js | B: custom shader | C: path tracer |
|---|---|---|---|
| Soft vs hard light | Light size widens the blur, but one blur width per light, so the backdrop shadow is no softer than the nose shadow | Exact: size and distance set softness, and shadows soften with distance from what casts them | Exact |
| Matches the 7 references | Yes | Yes | Yes, plus real light bouncing off the backdrop |
| Download (measured) | three.js: 2.1 MB, about 0.42 MB compressed | renderer 10 KB, no library | adds 0.5 MB (path tracer + BVH), plus a long setup |
| A realistic head later (Phase 7) | Straightforward: load a 3D model | Not possible as is; would need A's kind of renderer added | Works with A's scene |
| Complexity cost | Low: well-documented library | Medium: custom shader code; the head is a maths shape | High: the library's WebGL version is deprecated |
| Risk on unknown Chromebooks | Low | Low to medium (ARM GPUs) | High |

## Recommendation (Tom chooses)

**B for the studio, with A kept as a backup and C left for Phase 7.**

- **Why B:** "Light size controls softness" is a must-simulate item in the brief, and B is the only real-time option that gets it fully right, including the backdrop shadow. It needs no library (10 KB versus about 0.42 MB compressed for three.js), and at the same quality it's at least as fast as A on this laptop for the three-point look.
- **What it costs:**
  - A realistic head in Phase 7 would mean adding a three.js renderer then, about the size of A today.
  - The scene, lights, presets, exposure and metrics are shared code (`scene.js`), so only the drawing part would be added.
  - If ARM Chromebooks turn out to struggle with B, A is already written and can be swapped in behind the same interface.
- **If you'd rather keep one renderer for everything,** including a realistic head later: choose A. Its backdrop shadows will be less correct, but faces will be fine.
