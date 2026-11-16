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
| 2 | Core sandbox | Built, waiting for Tom's approval |
| 3+ | Gear, learning layer, accounts, … | Not started |

## Using it

- **Presets:** Three-point, High-key, Low-key, Blank studio. Undo brings your own setup back.
- **Map ("Studio from above"):** drag a light around the subject. With the keyboard: Tab to a light, then arrow keys move it (Shift for small steps), `+` and `-` change power, Space turns it on or off.
- **Selected light:** power, around (azimuth), height, distance, size. Each has a slider and a number box.
- **Backdrop:** brightness, distance behind the subject, and a hidden backdrop light.
- **Camera:** auto exposure (reads the bright side of the face) and exposure compensation.
- **Undo / Redo:** buttons, or Ctrl+Z / Ctrl+Y (Cmd on a Mac). A whole drag is one step.
- **Save PNG** saves the portrait. **Save setup** / **Open setup** save and open the lighting settings as a small file.
- The current setup is kept in the browser, so it's still there next time on the same computer.
- **Quality:** Auto measures the device when the page opens, steps down if dragging gets slow, and draws one sharper frame when you stop. Low, Medium and High can be chosen by hand.
- **Simple view:** devices without WebGL 2 get a 2D view automatically. `?view=simple` opens it on purpose.

## Files

```
index.html            The app page (loads /platform/wc.js for the Walsh Classroom bar)
src/main.js           Start-up and wiring
src/app.css           Styles
src/scene/            Scene model: schema.js (presets, cleaning input, files), history.js (undo),
                      lightmath.js (positions, falloff, exposure), head.js (the clay model)
src/render/           shader.js (3D view), fallback2d.js (simple view), quality.js (auto quality)
src/ui/               map.js (top-down map), panels.js (light, backdrop, camera settings)
tests/index.html      Browser tests and a preset-vs-reference sheet (open from a local server)
tests/app.html        The app with a timer-driven loop, for testing in a background tab
spike/                Phase 1 rendering test page (kept for reference)
vendor/               three.js and friends, used only by spike/
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
