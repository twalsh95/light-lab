# Light Lab: Phase 0 plan (draft for approval)

Written Nov 16 2026. Sources: `Light_Lab_Claude_Code_Brief.md`, the 7 reference renders and `render_prototype.py` (copied to `docs/light-lab-reference/`), and the walshclassroom hub repo (`README.md`, `brand/PLATFORM.md`, `brand/DESIGN.md`, `platform/auth.js`, `platform/classes.js`, `platform/firestore.rules`). No app code written, nothing installed.

## 0. Decisions so far (Tom, Nov 16 2026)

- **No accounts needed.** Light Lab works fully with nobody signed in: every mode runs, progress is kept in the browser (wrapped in try/catch), and the result exports as a PNG. Sign-in is never handled by the app.
- **Accounts are an optional extra.** If the page is on walshclassroom.com and `wc.user()` reports someone signed in, a "Save to my account" button appears. It saves setups to `users/{uid}/lightlabSetups/{id}`, which the live rules already allow, so no rules change is needed. If `wc.js` is missing or nobody is signed in, the account features are hidden.
- **Deferred until Light Lab joins the platform properly:** the teacher dashboard, assignments, class galleries, comments, live class mode, mastery sync and any new Firestore rules.
- **Tooling:** plain files, no build step, and a copy of three.js stored in the repo (not loaded from a CDN).
- **Devices:** Chromebooks are the baseline. The spike page reports the device's GPU and browser itself.
- **Look:** Light Lab's own palette under the WC bar; its hub card goes in the Studios group.
- **Not needed:** leaderboards, classes.
- **Recommendations accepted with the Phase 0 approval:** decide Phase 7 after Phase 4; galleries wait for platform work; Narrative Studio comment filter waits for teacher comments; authored content saved as JSON files in the repo; no audio notes (Chromebook dictation instead).
- **Renderer (Phase 1, Nov 16 2026):** B, the custom shader, with A as a backup and C deferred. See `PHASE1_SPIKE_RESULTS.md`. No Chromebook was available, so its numbers are estimates.
- **Open:** gear specs (needed by Phase 3).

## 1. What PLATFORM.md changes in the brief

| Brief says | Platform says | Change |
|---|---|---|
| Save the brief in the walshclassroom repo under `docs/` | Each app is **its own GitHub repo**, served at `walshclassroom.com/<repo>/`; the hub repo holds only the hub | Light Lab gets its own repo, `light-lab`, served at `walshclassroom.com/light-lab/`. The brief and references live in that repo's `docs/`. For now they're in this folder, which can become that repo. |
| Store work in Firestore collections of the app's own design | The data model table lists `apps/{appId}/work/{docId}`, **but the live rules have no `apps/` match**, so writes there would be refused. What works today is `users/{uid}/<collection>/...`, which a class's teacher can read through `classAccess` | Light Lab saves under `users/{uid}/lightlab*`. PLATFORM.md's table should be updated to match the rules (or the rules extended). |
| Reuse the Annotate It pattern for auth and rosters | **Annotate It doesn't exist** in the repos or the app list | Use `platform/wc.js`: `wc.user()`, `wc.role()`, `wc.onAuth()`, `wc.classes()`. Rosters come from `platform/classes.js` (`teaching()`, `roster()`). |
| Assign lessons and challenges with due dates | Platform Phase 4 (`assignments`, `wc.assignments()`) is **not built**, and there are no rules for it | Light Lab assignments wait for platform Phase 4, or Light Lab ships a stopgap (see question 3). |
| Firebase: confirm | Locked: Narrative Studio's project (`narrative-studio-backend`), Firebase JS SDK 11.6.0 from gstatic | Use the same project and the **same SDK version and config**, so the default Firebase app and the sign-in are shared. |
| Teacher roles | `.org`/`.edu` confirmed email or invite code; teachers read students' work via `classAccess` | No Light Lab roles of its own. |
| Branding | DESIGN.md: app colors aren't brand colors; apps keep their own look; the WC bar sits on top (44px) | Light Lab can keep its own palette under the WC bar. Its home-page card goes in the **Studios** bin (violet = Imagination) unless you say otherwise. |
| Rosters visible to students | Rosters are teacher-only; students see the class name and teacher only | Class galleries can't come from rosters. They use `classrooms/{id}/shared` (existing rule), with nickname only. |

## 2. File layout (proposed, no build step)

```
light-lab/                     own repo, GitHub Pages from main, topic "walshclassroom"
  index.html                   shell; loads /platform/wc.js; import map for three
  walshclassroom.json          hub card manifest
  src/
    main.js                    boot, capability check, quality ladder, error banner
    scene/  state.js schema.js undo.js presets.js        scene JSON, versioning, undo/redo
    render/ renderer3d.js shading/*.glsl fallback2d.js develop.js   (decided by the spike)
    metrics/ metrics.js classifier.js                     pure functions, no DOM
    ui/     map.js inspector.js panels.js describe.js vocab.js a11y.js
    modes/  sandbox.js lessons.js predict.js match.js name.js challenges.js station.js classmode.js
    data/   store.js (Firestore + offline queue) auth.js (wraps wc.*)
    teacher/ dashboard.js authoring.js csv.js
  vendor/three/                pinned three.module.js + the few addons used (no CDN dependency)
  data/gear.json  lessons/*.json  challenges/*.json  targets/*.json  quizzes/*.json
  content/drafts/              review queue (status: draft)
  assets/  models/ (glTF, Draco/meshopt) textures/ (KTX2 or WebP)  LICENSES.md
  tests/   metrics.test.js classifier.test.js scene-roundtrip.test.js rules.test.js
  docs/    LIGHT_LAB_BRIEF.md  light-lab-reference/  PHASE0_PLAN.md
  firestore.rules.patch        proposed additions to the hub's rules (you publish in the console)
```

Why no build step: native ES modules plus an import map run on current Chrome, Safari and ChromeOS, ship as plain files to GitHub Pages like your other apps, and you can edit a file and publish without a toolchain. Cost: more files on first load (fine on HTTP/2) and no tree-shaking. If the spike shows load time matters on the school network, add a small esbuild step that writes `dist/` (one JS file plus assets). Single-file HTML isn't realistic once there's a mesh and three.js.

Tests need Node plus the Firebase emulator, on your machine only, as dev tools. I'll ask before installing them (Phase 4/5).

## 3. Data model

### Scene state (changes from the brief's 5.1)
- Keep `version`, and add a migration function per version.
- Units: metres and degrees, subject-centred. `azimuthDeg` 0 = camera axis, negative = camera-left (as you wrote). `elevationDeg` instead of `heightDeg` (it's an angle). `distance` in m. Add `aim: { panDeg, tiltDeg }` as an offset from "pointing at the face", so feathering is possible.
- Replace `sizeScale` with the modifier's real size from `gear.json` plus `sizeOverride` (m) in Open studio.
- Lights carry `fixture` and `modifier` ids from `gear.json`, `power` 0..1 of that fixture's output, `kelvin` or `rgb`, and `flags: [{side, amount}]`.
- `backdrop.distance` is in metres behind the subject; `backdrop.light` is a nested light object, not a boolean.
- No `shared` field anywhere (see risks).

### Firestore (all under the existing live rules unless marked NEW)
| Path | Contents | Rule |
|---|---|---|
| `users/{uid}/lightlab/profile` | nickname, settings, seen-notice flag, mastery per concept | owner rw; class teacher read (live) |
| `users/{uid}/lightlabPlans/{id}` | Station Prep plans and challenge submissions: scene JSON, small JPEG thumbnail (<150 KB, base64), text, self-check, `peeked` flag | same |
| `users/{uid}/lightlabAttempts/{id}` | predict/match/name answers (for mastery) | same |
| `classrooms/{cid}/shared/{uid_planId}` | gallery entry: `ownerUid`, `projectId`, `appId: "light-lab"`, nickname, thumbnail | existing class-only rule |
| `comments/{id}` | your comment on a plan, with `appId: "light-lab"` | existing rule |
| NEW `lightlabSessions/{code}` + `/answers/{uid}` | live class mode: current scene, question, reveal state; one answer doc per student | teacher writes session; students write own answer; class members read |
| NEW (maybe) `lightlabContent/{id}` | content you author in the app | teachers write, signed-in read. Alternative: authoring tool exports JSON you commit (no rules change). |

Snapshots are not stored as images beyond the thumbnail. The scene JSON re-renders the full image on demand, because Cloud Storage now needs the Blaze plan (see risks).

## 4. Risks

1. **Auto-exposure can erase the lesson.** Average-metered AE brightens a low-key frame and darkens a high-key one, so they look alike. AE must meter the **lit side of the face** (spot or highlight metering), and the metrics must be computed before AE or on a fixed exposure. I'll calibrate this in the spike.
2. **`shadowStops` split at the nose line fails** for a front or overhead key (butterfly, loop from above): left and right match, so it reads as high-key though the under-chin shadow is deep. It also fails when the subject is turned. Proposal: split along the key's projected direction (or use the face's normals facing toward and away from the key), and add an "under-shadow" check.
3. **The reference renders can't calibrate `rimScore`.** In the prototype the back light barely shows: p2 and p3 differ by 1.3/255 on average, with a noticeable change in about 4% of pixels (a thin edge). The height-field head has no back half, so a real 3D head will show much more rim. The classifier tests on p3/p6 should be re-run against the new renderer's own p3/p6 presets, not the JPEGs.
4. **Comments collide with Narrative Studio.** It lists every comment where `studentUid` is the student, without filtering by app. Light Lab comments would show in Narrative Studio's inbox unless both use an `appId` field and Narrative Studio filters on it (a small Narrative Studio change).
5. **The `shared: true` field is site-wide readable.** The live rule lets *any* signed-in user read any user doc with `shared == true`. Light Lab must never use that field name for class-only items.
6. **Hidden targets aren't hidden.** All app code and data are public on GitHub Pages. A curious student can read `targets/*.json`. Low risk on locked-down devices; fine for practice, not for anything graded high-stakes.
7. **Content is the biggest cost** (as you said). 25+ challenges and 30+ scenes, each authored and approved.
8. **Device unknowns.** ChromeOS models vary widely (some are low-end ARM/Celeron with weak GPUs). Until I have numbers, "smooth on a Chromebook" is unverified.
9. **New rules need you.** Class mode (and in-app authoring, if chosen) need additions to the hub's shared rules file, published by you in the console, plus emulator tests.
10. **Spark quota.** 50k reads / 20k writes per day for the whole site. Class mode for 25 students is a few hundred operations per session, so fine, but the dashboard should read on demand, not keep listeners open.

## 5. Phase 1 rendering spike (how I'd run it)

- Folder `spike/` in the Light Lab repo, not wired to the hub, no sign-in. One page with a switch between candidates and a fixed scene list: the three-point and low-key looks (plus p6 and p7 as extra checks).
- **A. three.js real-time:** `MeshPhysicalMaterial` head (simple clay/sculpted glTF matched to the prototype's proportions), spot lights with shadow maps. Softness tied to light size by setting the shadow blur radius from the light's apparent size (PCF in current three.js; PCFSoftShadowMap is deprecated since r182) or a PCSS shader chunk. RectAreaLight for the soft *illumination* only, because it casts no shadows (confirmed in current docs).
- **B. Custom shader:** a full-screen ray-march over an SDF head (the prototype's ellipsoids and bumps), with soft shadows whose penumbra comes straight from light size and distance. This makes "size sets softness" exact and is likely the cheapest on GPUs.
- **C. Develop render:** three-gpu-pathtracer (MIT) on the A scene, progressive, for a still. Measured as time-to-clean-image, not FPS.
- Each page shows a live FPS / frame-time readout and a "copy results" button, with a fixed 20-second orbit of the key light so runs are comparable. You (or a student) open it on each device, press Run, and paste the result into a form or email. **I can't measure on your devices myself**; I'll report only the numbers you send back, labeled by device.
- Deliverable: a table (device × candidate × quality level → median ms/frame, 5th-percentile FPS), side-by-side renders against the references, a recommendation, and the complexity cost of each.

## 6. Effort (my estimate, unsure)

Your 1–2 weeks for Phases 1–3 is plausible for the engine *if* the spike picks one renderer quickly and your gear specs come in early. I think Phase 4 is at least as large as 1–3 together, because of lessons, predict/reveal flows and mastery logic. Phase 5 is smaller than it looks because the platform already does sign-in and classes; most of the work is the dashboard and rules tests.
