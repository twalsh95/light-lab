# Light Lab rendering spike (Phase 1)

A test page, not the app. It draws the clay head three ways and measures how fast each runs.
Nothing is saved or sent anywhere: results stay on the page until you copy or download them.

## The three candidates

| | How it draws | Soft vs hard shadows | Good for |
|---|---|---|---|
| **A: three.js shadow maps** | Standard real-time 3D (three.js 0.187.0), spot lights with shadow maps | Light size widens the shadow blur, but one blur width per light: the wall shadow is no softer than the nose shadow | Easiest to extend (models, materials, a realistic head later) |
| **B: custom shader** | One full-screen shader, no three.js. The head is a maths shape, as in the prototype | Exact cone soft shadows: big + close = soft, small + far = hard, and shadows soften with distance from what casts them | The teaching point "size sets softness"; smallest download |
| **C: path-traced Develop** | three-gpu-pathtracer 0.0.28 on the A scene; the image clears up over seconds | Physically accurate, including light bouncing off the backdrop | A "Develop" button for snapshots, not for dragging lights |

## How to run it on a device

1. Open `walshclassroom.com/light-lab/spike/` (once published), or serve this folder locally.
2. Plug the device in, close other tabs, and type the device's name in **Device name**.
3. Press **Run all candidates** and leave it alone for about 4 minutes.
4. Press **Download results** (or **Copy results**) and send me the file.
5. Optional: **Save comparison sheet** saves a PNG of the 7 references next to A and B.

The page notes the graphics chip, browser, screen and memory by itself, so you don't need to look up the model number.

## Reading the numbers

- **Typical fps / ms per frame:** what a student feels while dragging a light. 60 fps (16.7 ms) is the ceiling on most screens; 30 fps or better feels smooth enough for this.
- **Worst fps (5%):** the slowest 5% of frames, i.e. the stutters.
- **GPU ms:** how long the graphics chip spent per frame, where the browser reports it. It shows how much room is left when fps is capped at 60. Many browsers hide it ("n/a").
- **C:** seconds to reach 16 and 64 samples. About 64 looks clean for a still.

## Known spike shortcuts

- Lights are placeholders until the real `gear.json` (Phase 3).
- No barn doors, flags, colour gels, skin presets or 2D fallback yet.
- Only the key light, fill power and back light on/off are adjustable here.
- `three-gpu-pathtracer`'s WebGL class is marked deprecated in favour of a WebGPU version.
