# Claude Code Brief: "Light Lab" virtual lighting studio for Walsh Classroom (Tier 3 scope)

Save this file in the walshclassroom repo as `docs/LIGHT_LAB_BRIEF.md` and tell Claude Code to read it, or paste it in from the repo root. Unzip `Light_Lab_reference_renders.zip` into `docs/light-lab-reference/` (it holds the prototype renderer and the 7 reference images this brief describes).

This is a large build. It is written as gated phases so something usable ships early and I can stop at any gate. Do not build ahead of the phase I have approved.

---

## 0. First, before writing any code

1. Read `README.md` and `brand/PLATFORM.md`. Where this brief conflicts with them (hosting, folder layout, Firebase project, auth pattern, brand, build tooling, single-file vs multi-file), PLATFORM.md wins and you tell me what you changed.
2. **Authentication is email and password only, handled once by the Walsh Classroom website. Signing into the website signs the user into every app on it. No Google sign-in. This app must not have its own login screen or its own auth.** It only reads who is signed in. Reuse the pattern the "Annotate It" app (or any existing app) uses for shared auth, class membership, and teacher roster views. If PLATFORM.md does not say how an app reads the signed-in user, ask me.
3. Treat every technical claim in this brief about libraries, performance, and licensing as **my general knowledge, not verified**. Verify against current documentation and on real devices before you rely on it. Where you find I am wrong, tell me and change course.
4. Write a short plan (file layout, data model, Firestore collections, the phase list in section 11, and the spike in Phase 1). Show it to me and wait for my OK.
5. Ask me the questions in section 12 that PLATFORM.md does not already answer. Do not guess on those.

## 1. What this is

I teach the Media Arts Career Academy at a charter high school (grades 9 to 12). In the Freshman Career Academy portrait unit, students learn three-point lighting, high-key, and low-key. They see it in a slide deck and then rotate through three real lighting stations in my room. The real stations are the point of the unit, but they have limits: nine lights, three stations, hot lamps, and 25 students at once.

I want **Light Lab**: a virtual photo studio where a student places and adjusts lights around a model, sees the portrait change instantly, and builds judgment about cause and effect. It supports the real stations (practice before, review after, and a safe option for absent students). It does not replace them.

Students use school MacBooks (Chrome, Safari), some Chromebooks, and sometimes iPads. Phones are not available at school. I also run it on the projector.

The look I want students to learn to read is the one in `reference/`:

- `p1_key.jpg` key light only
- `p2_keyfill.jpg` key plus fill
- `p3_three.jpg` three-point (key, fill, back)
- `p4_highkey.jpg` high-key
- `p5_lowkey.jpg` low-key
- `p6_trap.jpg` black backdrop but balanced three-point (**not** low-key)
- `p7_whitebg_lowkey.jpg` light backdrop with one-sided shadows

Those were rendered by `reference/render_prototype.py` (a height-field head, Lambert shading with wrap, a ray-marched soft shadow, a blurred wall shadow). It is a throwaway prototype. Use it as the visual target and as the source of the head proportions, not as code to port.

## 2. Pedagogy (this decides what the app must do and must not do)

- **Teaching idea to preserve:** lighting is a set of choices that create a mood. There is a family of good answers, not one. The goal for students is to *justify a lighting choice*, not to find a single correct setup.
- Separate the goal from the means (my school uses Universal Design for Learning). The goal is "explain how this light changes the picture". The means can be dragging, typing numbers, choosing presets, or describing in words.
- **Prediction before action.** Where possible ask "what will happen if...?" before the student does it, then reveal. This is the strongest learning move in the app.
- **Guiding questions over answers.** Feedback should mostly be a question ("The shadow side is much darker than the target. What could you add or raise?"), not a fix.
- **No AI scoring of student writing, ever.** Objective things (does the setup match the target within tolerance, quiz answers) are auto-scored. Written justifications are read by me, with a rubric self-check for the student.
- **Honest simplification.** Show a short note in the app: "This is a simplified studio. Real skin, hair, and lights behave in more complicated ways. Use this to build your instincts, then check them at the stations."

### Vocabulary (keep these terms and plain definitions in the UI)

- **Key light:** the main light. The brightest. Sets the direction of the shadows.
- **Fill light:** a softer light that lightens the shadows the key makes.
- **Back light:** a light behind the subject that outlines the head and shoulders.
- **Hair light:** a back light aimed at the top of the head (optional extra).
- **High-key:** bright, even, few shadows. Fill nearly matches the key. Usually a bright backdrop.
- **Low-key:** dark and dramatic. Deep shadows. Little or no fill.
- **Backdrop:** what is behind the subject.
- **Modifier:** a tool that shapes light (softbox, umbrella, beauty dish, snoot or grid, barn doors).
- **Soft light / hard light:** big, close light gives soft shadows. Small, far light gives hard shadows.
- **Falloff:** light gets weaker as it moves farther from the subject.
- **Color temperature:** how warm (orange) or cool (blue) a light is.

The three clues for reading a portrait (used in my lesson, and in the app's "Name the setup"): **1. Shadows** (deep or soft?), **2. Background** (dark or bright; one clue only), **3. Brightest side** (where is the key?). **The backdrop is a clue, not the answer.** A black backdrop with a balanced three-point is not low-key.

## 3. The experience

### 3.1 The studio screen

- **Camera view:** the live portrait. Updates in real time while the student drags or slides.
- **Top-down map:** a bird's-eye view of subject, camera, backdrop, and every light. Drag a light to move it around the subject. The beam direction and light size are drawn. This is the main control surface and doubles as the "diagram" students already draw on exit tickets.
- **Light inspector** (for the selected light): on/off, power, height, aim, distance, size (soft to hard), color temperature or color, modifier, flags and barn doors.
- **Backdrop panel:** color and brightness, whether it has its own light, distance from the subject.
- **Subject panel:** model choice, turn left or right, skin tone presets, optional glasses and hair (see 6 for the model plan).
- **Camera panel:** exposure compensation slider and an auto-exposure toggle (default on so the student sees the lighting look, not a dark frame). No full exposure triangle here; that is taught elsewhere.
- **Scene description panel** (always visible, toggleable): plain-language text generated from the current scene state, for example: "Key light on the left, high, bright. Fill on the right, dim. Back light behind on the right. The shadow side is softly darker. The backdrop is dark." This is the accessibility feature and also a learning feature (students compare what they see to what the words say).
- **Vocabulary tooltips** on every term.
- **Undo and redo, reset, and presets:** three-point, high-key, low-key, and "blank studio".
- **Snapshot:** save the portrait plus the top-down diagram plus the settings as a PNG and as a one-page PDF (for Google Classroom).

### 3.2 Modes

1. **Sandbox.** Everything unlocked, no scoring.
2. **Guided lessons** (short, 5 to 10 minutes each, authored as data):
   - Build three-point one light at a time (key only, add fill, add back).
   - The fill light is the mood dial.
   - The backdrop is a clue, not the answer.
   - Soft vs hard: change size and distance.
   - Color temperature: warm halogen next to cool LED and the color cast it makes.
3. **Predict and reveal.** "Turn the fill light off. What happens to the shadow side?" Student chooses from options (or types), then does it, then sees the result.
4. **Match the look.** A target portrait is shown (rendered from a hidden setup). The student recreates it. Scoring compares **measurable properties**, not pixels (see 5). Feedback is guiding questions. A "show a hint" button reveals one property at a time. A "peek at the setup" option exists but is recorded.
5. **Name the setup.** A portrait is shown; the student answers high-key, low-key, or balanced three-point, using the three clues, and states which clue decided it. Content comes from rendered scenes (computed answer from the same classifier as 5.3) and later from my own real photos (Phase 8).
6. **Client challenges.** A short brief with a constraint, for example: "Light a portrait for a mysterious album cover. Three lights maximum." The student builds a setup and writes 2 to 3 sentences justifying their choices. Not auto-scored; I read it, with a student self-check rubric. Each challenge has a **Career Connection** card (real job titles and how they use this skill).
7. **Station Prep.** Before our real rotation, a student plans the setup for a station, using only the lights that station has, and saves a **Lighting Plan** (diagram, settings, a one-sentence reason). Plans are visible to me; after the real stations the student can compare the plan to what they actually shot.
8. **Class mode (live, projector friendly).** I drive a scene on the projector and the class answers predictions on their own screens; results show as a live bar chart. Detailed in Phase 6.

### 3.3 Progression

Mastery tracks by concept, not by points: **Light roles**, **Fill and mood**, **High-key and low-key**, **Reading a photo (three clues)**, **Soft and hard light**, **Color temperature**, **Modifiers**. Each concept has a mastery meter based on repeated correct reasoning across different scenes. No timers, no speed scoring. Leaderboards off.

### 3.4 Teacher dashboard

- Roster by class: concept mastery, challenges completed, lessons finished.
- Assign a lesson, a challenge, or a Station Prep to a class with a due date.
- Gallery of submitted Lighting Plans and challenge justifications (nickname only on class-visible views; I can see the account identity in my private view).
- Per-challenge view: who has submitted, rubric self-check results, a place for my comment.
- CSV export.
- **Authoring tools** (no code needed): create or edit a challenge, a Match-the-look target, a lesson, a quiz scene, gear presets, and the tolerance bands and feedback questions for each.

## 4. Lighting simulation requirements

The simulation does not have to be photometrically exact. It does have to be **physically plausible and pedagogically correct**: the things students are about to learn must behave the right way, and nothing in it may teach a wrong idea.

**Must simulate correctly:**
- Inverse-square falloff with distance (a light moved twice as far is about a quarter as strong at the subject).
- Angle of incidence (cosine falloff on surfaces turned away from the light).
- **Light size controls softness** (penumbra width on the shadow edge): a large, close source gives soft shadows; a small, far source gives hard shadows.
- Soft shadows cast on the face (nose, brow, chin) and on the backdrop.
- Fill reducing the visible shadow depth without removing it.
- Rim or edge light from a back light that outlines head and shoulders.
- A backdrop that can be lit separately from the subject, with its own falloff.
- Color temperature mixing: warm sources (halogen, about 3200 K, my estimate) against cool (daylight-style LED) produce visible color casts on the face and backdrop.
- Auto exposure (so the student reads the lighting ratio, not an overall dark frame), with an off switch.
- Flags and barn doors blocking light from the backdrop or a side.
- Specular highlights from a moderately glossy skin material, so modifiers feel different (a beauty dish gives a crisper highlight than a softbox).

**Deliberately omit (say so in the UI notes):** lens effects, noise, real skin subsurface scattering beyond a simple approximation, the full exposure triangle, and strobe flash duration.

**Physical-light model:** a light has power, color, position, aim, size and shape (disc, rectangle), a distribution (spot angle or flood), and an optional modifier that changes size, shape, distribution and falloff. Spec values should live in `data/gear.json`, not in code.

## 5. Scene model, metrics, and scoring (this keeps scoring consistent with what I teach)

### 5.1 Scene state (JSON, saved with every plan)

```json
{
  "version": 1,
  "subject": { "model": "clay-head", "skin": "neutral-mid", "yaw": 0, "glasses": false },
  "camera": { "evCompensation": 0, "autoExposure": true },
  "backdrop": { "color": "#808080", "brightness": 0.3, "ownLight": false, "distance": 1.2 },
  "lights": [
    { "id": "key", "role": "key", "fixture": "neewer-cb60", "modifier": "softbox-90",
      "on": true, "power": 0.9, "azimuthDeg": -45, "heightDeg": 30, "distance": 1.6,
      "sizeScale": 1.0, "kelvin": 5600 }
  ]
}
```

(`azimuthDeg` is measured from the camera axis, negative to camera-left. Names and units are suggestions; propose better ones in your plan.)

### 5.2 Measurable properties (compute from the rendered frame or from the scene)

- `faceMean`: mean linear luminance over the face region.
- `shadowStops`: `log2(lit-side mean / shadow-side mean)` across the face, split at the nose line. This is the lighting-ratio proxy and **the main high-key / low-key signal**.
- `backdropMean`: mean luminance of the backdrop region.
- `rimScore`: how much brighter the silhouette edge is than the adjacent face or shoulder region.
- `keySide`: which side is brighter (left or right).
- `overallMean`: mean luminance of the whole frame.
- `colorCast`: average hue offset of the face from neutral.

### 5.3 Setup classifier (for Name the setup and for labeling Match-the-look targets)

Primary signal is `shadowStops`; `backdropMean` and `overallMean` support it. Backdrop alone never decides. **Starting thresholds (my estimates, you must calibrate them against the 7 reference renders and tell me the numbers you chose):**

- High-key: `shadowStops` small (about 0.7 or less), `backdropMean` bright, `overallMean` bright.
- Low-key: `shadowStops` large (about 2.5 or more), little fill.
- Balanced three-point: everything between, with a visible rim when a back light is on.

Required results on the references: `p4` high-key, `p5` low-key, `p3` and `p6` balanced three-point, `p6` must **not** classify as low-key even though its backdrop is near black, and `p7` must come out as low-key lighting on a light backdrop (it should be labeled as "dramatic, one-sided light on a bright backdrop" in the UI, since photographers argue about whether that is "low-key"). Treat this as a test suite.

### 5.4 Match the look scoring

A target stores desired values plus tolerance bands per metric, and a guiding question for each miss:

```json
{
  "id": "mysterious-album-cover",
  "title": "Mysterious album cover",
  "targetScene": { "...": "hidden setup" },
  "metrics": {
    "shadowStops": { "target": 3.0, "full": 0.6, "partial": 1.4, "ifTooLow": "The shadow side is lighter than the target. What could you turn down or move?", "ifTooHigh": "The shadow side is much darker than the target. What could you add or raise?" },
    "backdropMean": { "target": 0.05, "full": 0.04, "partial": 0.1 }
  },
  "careerConnection": "..."
}
```

Score = how many metrics are inside the full band (full credit) or the partial band (half). Do not compare raw pixels. Several different setups can match one target; that is correct.

## 6. Rendering and model plan

### 6.1 Decide by measurement (Phase 1 spike)

Candidate approaches, in the order I would try them (verify each; this is my general knowledge):

1. **Real-time WebGL with Three.js**, using spot or directional lights with soft-shadow techniques, and an emissive-plane or custom shader trick for softbox-style light size. Note: as far as I know Three.js `RectAreaLight` gives soft area lighting but **does not cast shadows**, so the shadow softness must come from another method. Confirm.
2. **Custom shader** (a small ray-march or shadow-map filter) tuned to look like the reference renders. It may give the most control over the "light size sets softness" teaching point.
3. **Progressive path tracing** (for example a three.js path-tracer library) as an optional **"Develop" button** that refines a still frame to a physically accurate soft-shadow image. Too heavy for the interactive loop on school devices, but possibly right for the final snapshot and for the Tier 3 realism upgrade.

The recommended shape, to confirm in the spike: **a fast real-time preview for interaction plus an optional higher-quality "Develop" render for snapshots**.

**Spike deliverable:** one page of each candidate showing the three-point and low-key reference looks, measured frame rate on (a) a recent school MacBook, (b) a school Chromebook, and (c) an iPad if available, a recommendation, and what it costs me in complexity. I choose.

### 6.2 Quality ladder

Auto-detect device capability and pick a quality level (render scale, shadow quality, number of active lights). Always let the student override. Never let the interaction drop below a smooth frame rate on a school Chromebook; lower the quality instead.

### 6.3 The model

My recommendation, and the reason: **a stylized "clay" mannequin head and shoulders is the default.** It is how real lighting artists test lights, it isolates how the light behaves, it avoids the uncanny valley, and it avoids representing a real person or any one identity. Match the proportions of the reference renders (a head with brow, eye sockets, nose, chin, a neck, and broad shoulders). Provide material presets so students see exposure and color effects across values: **several skin-tone presets across the full range, plus a white-shirt and dark-jacket option**. Lighting different skin tones and clothing is a real professional skill, and the presets must be handled respectfully and neutrally in the UI (describe them by value and warmth, for example "light", "medium", "deep"; no stereotyping or labels beyond that).

My scope for Tier 3 also includes a **realistic head** (Phase 7), because I asked for it. Do it only after the earlier phases are approved, and only with a model whose license allows classroom and commercial use and redistribution in a web app. **Record every asset's source and license in `assets/LICENSES.md`.** Do not use a scan or model of a real person unless I have written permission. Hair is a stretch within Phase 7: a simple hair-cap with rim-light response is fine; do not chase strand rendering.

### 6.4 Gear data (the real room)

Build `data/gear.json` from the lights I actually have. **Confirm specs with me or from the fixture labels; do not invent numbers.** What I know:

- Neewer CB60 LED, 2 units (I use these as key and back light).
- Bi-color LED panels, 2 units (adjustable warm to cool).
- RGB LED panels, 2 units (adjustable color).
- Halogen Fresnel spot lights, 2 units, using 120 V 650 W halogen photo-optic lamps (the 400 W / 200 W figures in my older notes may be wrong; ask me). These are warm, bright, focusable, and very hot.
- One LED can light.
- Modifiers: softbox, umbrella, beauty dish, snoot or grid, barn doors, reflectors, V-flats, flags (confirm what I own).
- Backdrops: confirm (seamless paper colors, muslin, black cloth).

Add a **"Room mode"** that limits Light Lab to exactly the lights I have, split across three stations (Three-Point, High-Key, Low-Key), so Station Prep matches reality. Add an **"Open studio"** mode with unlimited gear for experimenting.

## 7. UDL and accessibility (my school requires UDL)

- Every control has a keyboard path. Selected light: arrow keys move it on the map, `+` and `-` change power, `Tab` cycles lights. Everything works without a mouse.
- Touch support for iPads and touch laptops; large touch targets.
- The scene description panel (3.1) is live text, readable by a screen reader, and updates on change. Announce changes politely (`aria-live="polite"`).
- Never rely on color alone: lights are distinguished by shape, label, and number as well as color (key, fill, back each get a letter and an icon). Meet WCAG 2.1 AA contrast.
- Multiple ways to do the same thing: drag on the map, type numbers in the inspector, or pick a preset. Multiple ways to show learning: build, choose, write, or record a short audio note.
- Sentence frames and a word bank for written justifications, on by default and removable.
- Timers off, no speed scoring, adjustable text size, high-contrast theme, `prefers-reduced-motion` respected, captions or transcripts for any guided-lesson narration.
- Goal and means stay separate: the goal is "explain how this light changes the picture", not "find the one right setup".

## 8. Privacy and guardrails

- Students sign in through the website. This app stores the minimum: the user's UID from the shared auth, a **student-chosen nickname** shown to classmates, class code, progress, and saved plans. It never copies or displays email addresses or real names on any class-visible screen and never writes them into app data. Leaderboards are off by default; if I turn them on, they are class-only, nickname-only, and based on mastery or completion, not speed.
- Never send student writing, names, or any student data to an AI service or third-party API. The only AI use in this project is you writing code and authoring drafts that I review.
- **No real photos of people in this repo.** The four portraits I use in class slides are student and staff photos I have permission to show in class only. Do **not** copy them, ask me for them, or embed them. All images in the app are renders of the model plus my own clearly released images (Phase 8), each recorded in a manifest with source and rights.
- Firestore rules: students read and write only their own progress and plans; teachers read their own classes; shared content (gear, lessons, public challenge definitions) is public read.
- A short plain-language "what this app saves" notice the first time a user opens it.
- Saved plans contain scene settings, a snapshot of the model render, and the student's text. They do not contain any camera, microphone, or location data.

## 9. Tech constraints

- Follow PLATFORM.md for hosting and build tooling. My general preference has been **single-file HTML/JS for school-device simplicity**. A Three.js app is larger than that; if single-file is not realistic, propose the lightest alternative (for example a small build that bundles to a single deployable page plus an assets folder) and explain the tradeoff. Static hosting (GitHub Pages) unless PLATFORM.md says otherwise.
- School devices have no dev tools, so surface errors on screen in plain language (for example "Your device can't run the 3D view. Switching to simple view.") and provide a **simple 2D fallback** (a reduced-feature version of the shading that works without WebGL) so no student is locked out.
- Fast on a school network: compress textures and meshes, lazy-load, load the model once, cache.
- Offline-tolerant: if the network drops mid-session, keep working and sync saves when it returns. Wrap any `localStorage` use in try/catch.
- Keep **all content in data files** (`data/gear.json`, `lessons/*.json`, `challenges/*.json`, `targets/*.json`, `quizzes/*.json`) so I can add or change content in the authoring tool without touching code.
- Tests: unit tests for the metrics and classifier (the reference-render test suite in 5.3), a smoke test for scene serialization round-trips, and a security-rules test for the Firestore rules.

## 10. Content (the real bulk of the work)

The engine is the smaller part. The learning value is in the content, which I will author **with** you, not receive from you. Plan for:

- 6 guided lessons (list in 3.2).
- 25 or more Match-the-look targets and client challenges across difficulty, each with a Career Connection card, tolerance bands, and guiding-question feedback.
- 30 or more Name-the-setup scenes (computed answers), then 20 or more keyed real photos of my own in Phase 8.
- Standards tags on each lesson and challenge. Start with the Massachusetts CTE tags I already use in my lesson plans (Graphic Design and Visual Communications Standard 4 on lighting techniques, and Multimedia Production and Broadcast Standard 5 on lighting, sets and props); I will supply the final list. Do not invent standard codes.

For each content batch, give me drafts in a review queue (`content/drafts/`) with `status: draft` and I approve before they go live.

## 11. Phases and acceptance criteria

Each phase ends with a deployable build behind a feature flag, a commit with a clear message, README and `brand/PLATFORM.md` updates, and a list of what to test. I approve each gate before the next starts.

**Phase 0: Plan.** File layout, data model, Firestore collections, risks, and answers to section 12. *Done when:* I approve the plan.

**Phase 1: Rendering spike.** The three-candidate comparison from 6.1 with measured frame rates on real school-type devices. *Done when:* I have the page, the numbers, and a recommendation, and I choose.

**Phase 2: Core sandbox (no accounts).** Clay head, three lights, top-down map, camera view, backdrop with its own brightness, soft shadows, auto exposure, presets (three-point, high-key, low-key), undo and redo, scene state JSON, the 2D fallback. *Done when:* the presets recognizably reproduce `p3`, `p4`, and `p5`, the interaction is smooth on a school Chromebook at the chosen quality level, and a student can complete a three-point build with keyboard only and with mouse only.

**Phase 3: Gear and modifiers.** `gear.json` from my real room (after I confirm specs), modifiers, color temperature and color, size and distance effects, barn doors and flags, Room mode and Open studio, skin tone and clothing presets, snapshot to PNG and one-page PDF. *Done when:* soft vs hard and warm vs cool are obvious and correct, and a snapshot opens cleanly.

**Phase 4: Learning layer.** Scene description panel, vocabulary tooltips, guided lessons, predict and reveal, Match the look with metric scoring and guiding-question feedback, Name the setup with the classifier, concept mastery meters. *Done when:* the classifier test suite from 5.3 passes with thresholds I have approved, and a student can finish one lesson and one challenge end to end.

**Phase 5: Shared sign-in and teacher dashboard.** Read the signed-in user from the website's shared auth (no login screen in this app), nicknames, class membership, progress sync, Lighting Plan submission and gallery, assign lessons and challenges, per-concept roster view, CSV export, Firestore rules. *Done when:* signing into the website once puts a user straight into Light Lab, signing out signs them out here, a test class of 3 accounts shows correct progress, and a student cannot read another student's data (proved by rules tests).

**Phase 6: Live class mode and projector mode.** Session codes, teacher-driven scene, live prediction chart, reveal, next scene, large-type projector layout. *Done when:* 25 simulated clients can join one session without lag and the chart updates in under 2 seconds.

**Phase 7: Realism upgrade (optional, gated).** A realistic head option, a simple hair response, and the progressive "Develop" render for snapshots. *Done when:* every asset has a recorded license, the realistic option still runs acceptably on the quality ladder, and the classifier still passes with the realistic model. I may choose to skip this phase.

**Phase 8: Content and library.** Authoring tools, the content in section 10, and my own real photos keyed for Name the setup (with a keying tool like the one in Annotate It, if that app exists; reuse it). *Done when:* I have approved a full first content pack and can add a challenge in under 5 minutes without code.

**Phase 9: Pilot and hardening.** Run one class on it; fix what breaks. Accessibility audit (keyboard, screen reader, contrast, reduced motion), performance pass on every device type, and a short teacher guide. *Done when:* I have run it with a real class and approve the fixes.

### Rough effort (my estimates, not measurements)

Phases 1 to 3 are the smallest and give a usable studio; I would expect roughly one to two weeks of focused work with feedback. Phases 4 to 6 are the largest and add most of the teaching value. Phases 7 to 9 depend heavily on content and realism choices. A full Tier 3 build is weeks of part-time work; the content in Phase 8 is likely the largest single cost. Tell me where your estimate differs.

## 12. Questions to ask me before you build (skip any PLATFORM.md already answers)

1. Same Firebase project as the rest of Walsh Classroom, with the shared sign-in? Confirm from PLATFORM.md.
2. Its own app at `walshclassroom.com/light-lab`, or a section inside an existing app (for example next to Annotate It)?
3. Build tooling: is a build step acceptable, or must it be a single HTML file? Where should large assets (meshes, textures) live: the repo or Cloudinary?
4. Exact fixture specs for `gear.json` (read them from labels in the room): CB60 power, bi-color range, RGB behavior, halogen Fresnel wattage and spot/flood range, modifier sizes, backdrop types.
5. Devices: which exact Chromebook and MacBook models and browsers should be the performance baseline? Are iPads in play?
6. Realism: do I want to commit to Phase 7 now, or decide after Phase 4?
7. Leaderboards: off entirely, or class-only with nicknames?
8. Branding: follow the platform brand, or give Light Lab its own look (my class slides for this lesson used a dark ink, amber, and cool blue palette, and the key, fill, and back lights are color-coded amber, blue, and red)?
9. Which classes should have it: Freshman Career, Photography, others? Should lessons and challenges be organized into per-class packs?
10. Should a student's Station Prep plan be visible to other students after the real stations (a gallery), or only to me?
