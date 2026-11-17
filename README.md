# Light Lab

A virtual lighting studio for Walsh Classroom. Students place and adjust lights around a clay
model and see the portrait change instantly, to build judgment about three-point, high-key and
low-key lighting before and after the real lighting stations.

Live at **walshclassroom.com/light-lab/**. No sign-in, and nothing is sent anywhere.

## Status

| Phase | What | State |
|---|---|---|
| 0 | Plan | Approved Nov 16 2026 (`docs/LIGHT_LAB_PHASE0_PLAN.md`) |
| 1 | Rendering spike | Done: renderer B chosen (`docs/PHASE1_SPIKE_RESULTS.md`, test page in `spike/`) |
| 2 | Core sandbox | Approved Nov 16 2026 |
| 3 | Gear and modifiers | Approved Nov 16 2026 (`docs/PHASE3_GEAR_NOTES.md`: remaining estimates, gobo set still to match) |
| 4 | UI pass (first), then the learning layer | Approved Nov 17 2026: UI pass, learning layer, classifier thresholds (`docs/PHASE4_CLASSIFIER.md`) and content |
| 5+ | Accounts, class mode, … | Not started |

## Using it

- **Header:** *Our room* (only the real gear in `data/gear.json`) or *Open studio* (any gear, any amount, any light size); presets (Three-point, High-key, Low-key, Blank studio); Undo and Redo; and the **Save / open** menu.
- **Save / open:** save the picture (PNG) or a one-page PDF (portrait, lighting diagram, settings), save a setup file, open one again (Phase 2 files still open), or start over.
- **The studio card** switches between **From above** (the map) and **3D studio**: the set as you'd see it in the room, with every light on its stand drawn as what it is (softbox, umbrella, Fresnel with barn doors, panel, snoot, gobo, reflector), a faint beam, and the camera on its tripod. Drag a light to slide it across the floor at the same height; Shift-drag to raise or lower it. Drag empty space to look around; scroll or pinch to zoom (arrow keys, + / - and Home work too). Quick views: from the camera, from above, from the side, from behind, reset. three.js loads only when the 3D view is first opened.
- **Light chips** above the map: click one to pick that light; its switch turns it on or off.
- **Studio from above (map):** drag a light or reflector around the subject. Keyboard: Tab to it, arrow keys move it (Shift for small steps), `+` and `-` power, Space on or off, Delete removes it.
- **Side view** under the map: drag the selected light up or down to change its height (arrow keys work too).
- **Add a light** (pick the light and its job: key, fill, back, hair, accent, backdrop) or **a reflector** (white, silver, gold) under the map.
- **Selected light:** job, on/off and remove at the top; then light, modifier, power, around, height, distance, and **Points at** (the face or the backdrop); size in Open studio; spot ↔ flood on the Fresnels. **Fine aim** turns or tilts the light off its target (feathering). **Colour** (warm ↔ cool, RGB, gel) and **Shape the beam** (gobo, barn doors, black flag) fold open when needed. Hover over or focus a setting to see what it does.
- **Camera bar** under the portrait: **Auto** (the camera picks aperture, shutter and ISO; exposure compensation brightens or darkens) or **Manual** (students pick all three). A meter scale shows how many stops brighter or darker than correct the picture is. The numbers are real: they follow the photographic exposure formula with the real light levels in lux, so they're the settings a real camera in the room would need. A wide aperture blurs the backdrop (depth of field, focused on the face); high ISO adds grain. Shutter speed only changes brightness here (the subject is still).
- **Compare:** freezes the current picture; change something, then slide between Before and Now. "Use before setup" goes back to the frozen setup (Undo returns).
- **Bigger:** enlarges the camera view to fill the window (Esc to close), for the projector or a close look.
- **Backdrop, Subject, Camera** (folding sections): backdrop type and distance; skin tone and clothing; camera body and lens from the room (`data/cameras.json`: Sony a65, a55, a58, a99 II, a7 IV, a6100, Canon Rebel T7, and their lenses; only lenses that fit the body's mount are offered), zoom (the camera steps back for longer focal lengths to keep head-and-shoulders framing), white balance.
- **Warnings** appear under the map, for example when a light stands behind the backdrop paper (it can't reach the subject).
- **Undo / Redo:** a whole drag is one step. Ctrl+Z / Ctrl+Y (Cmd on a Mac).
- The current setup is kept in the browser, so it's still there next time on the same computer.
- **Quality:** Auto measures the device when the page opens, steps down if dragging gets slow, and draws one sharper frame when you stop.
- **Description** under the portrait: plain sentences about the setup and what the picture shows (read out by screen readers as things change). Lighting words get a dotted underline with a definition on hover or keyboard focus (`data/vocab.json`).
- **Learn** (button in the header): guided lessons, Predict and reveal, Match the look (a hidden target setup; feedback compares measured shadow depth, backdrop brightness, rim and bright side, never pixels), Name the setup (high-key, low-key or balanced; the app measures the picture, so the answer always matches it), Progress (concept meters that grow with correct answers on different scenes, kept in this browser only), and Words. Content lives in `content/`; drafts show only with `?drafts=1`.
- **Simple view:** devices without WebGL 2 get a 2D view automatically. `?view=simple` opens it on purpose.

## Files

```
index.html            The app page (loads /platform/wc.js for the Walsh Classroom bar)
src/main.js           Start-up and wiring
src/app.css           Styles
data/gear.json        Tom's real gear, gels, gobos, skin and clothing presets (edit here, not in code)
data/cameras.json     Camera bodies and lenses (ISO, shutter and aperture ranges, sensor size, focal length)
src/scene/            Scene model: schema.js (presets, cleaning input, files), history.js (undo),
                      gear.js (gear list, Room-mode inventory), lightmath.js (positions, falloff,
                      exposure, colour, reflectors, barn doors, aim), camera.js (aperture, shutter,
                      ISO, Auto, meter), head.js (the clay model)
src/render/           shader.js (portrait, plus the lens pass: depth of field and grain), fallback2d.js
                      (simple view), quality.js (auto quality), beammask.js (barn doors/flags/gobos for 3D)
src/ui/               map.js (top-down map), studio3d.js (3D studio view), sideview.js (height), chips.js (light chips),
                      camerabar.js (Auto/Manual, aperture, shutter, ISO, meter),
                      panels.js (settings panels), snapshot.js (PNG and PDF)
src/metrics/          metrics.js (shadow depth, backdrop, rim, bright side, colour from the picture), classify.js (high-key / low-key / balanced)
src/learn/            content.js (loading, scenes, task checks), describe.js, vocab.js, progress.js; the Learn card is src/ui/learn.js
content/              Lessons, predict questions, Match the look targets, Name the setup scenes (JSON; "status": "draft" until Tom approves)
data/vocab.json       Vocabulary definitions
tests/index.html      Browser tests and a preset-vs-reference sheet (open from a local server)
tests/app.html        The app with a timer-driven loop, for testing in a background tab
spike/                Phase 1 rendering test page (kept for reference)
vendor/               three.js (used by the 3D studio view and spike/), plus the path tracer used only by spike/
docs/                 Brief, plan, Phase 1 results, reference renders
assets/LICENSES.md    Every third-party file and its license
```

## Running it locally

Any static file server works, for example from this folder:

```
py -m http.server 8765
```

Then open `http://localhost:8765/` for the app and `http://localhost:8765/tests/` for the tests.
Opening `index.html` directly from the file system won't work, because browsers block modules there.

## Rules this project follows

- No login screen of its own. Accounts (Phase 5) will come from the Walsh Classroom sign-in.
- No student data is sent to any AI service or third-party API.
- No real photos of people in this repo.
