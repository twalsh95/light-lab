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
| 4 | UI pass (first), then the learning layer | UI pass built, waiting for Tom's review (`docs/ui-pass/`); learning layer not started |
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
- **Backdrop, Subject, Camera** (folding sections): backdrop type and distance; skin tone and clothing; auto exposure, exposure compensation, white balance.
- **Warnings** appear under the map, for example when a light stands behind the backdrop paper (it can't reach the subject).
- **Undo / Redo:** a whole drag is one step. Ctrl+Z / Ctrl+Y (Cmd on a Mac).
- The current setup is kept in the browser, so it's still there next time on the same computer.
- **Quality:** Auto measures the device when the page opens, steps down if dragging gets slow, and draws one sharper frame when you stop.
- **Simple view:** devices without WebGL 2 get a 2D view automatically. `?view=simple` opens it on purpose.

## Files

```
index.html            The app page (loads /platform/wc.js for the Walsh Classroom bar)
src/main.js           Start-up and wiring
src/app.css           Styles
data/gear.json        Tom's real gear, stations, gels, gobos, skin and clothing presets (edit here, not in code)
src/scene/            Scene model: schema.js (presets, cleaning input, files), history.js (undo),
                      gear.js (gear list, Room-mode inventory), lightmath.js (positions, falloff,
                      exposure, colour, reflectors, barn doors), head.js (the clay model)
src/render/           shader.js (3D view), fallback2d.js (simple view), quality.js (auto quality)
src/ui/               map.js (top-down map), studio3d.js (3D studio view), sideview.js (height), chips.js (light chips),
                      panels.js (settings panels), snapshot.js (PNG and PDF)
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
