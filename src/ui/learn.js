// The Learn card: guided lessons, predict and reveal, Match the look, Name the setup, progress
// and a word list. It sits at the top of the settings column, so the studio stays in view.
// No scoring of anything students write (it stays in this browser); no timers.
import { h } from "./panels.js";
import { linkify, vocabTerms } from "../learn/vocab.js";
import { buildScene, applyPatch, checkAll } from "../learn/content.js";
import { CONCEPTS, record, mastery, lessonDone, isLessonDone, saveNote, note, recordPeek, peeked } from "../learn/progress.js";
import { classify, CLASSES } from "../metrics/classify.js";
import { describe } from "../learn/describe.js";

const P = (text, cls) => h("p", cls ? { class: cls } : {}, linkify(text));
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);

export function createLearn(el, ctx) {
  const { history, content, announce } = ctx;
  let view = "home", lesson = null, step = 0, onSettle = null;
  let stepState = {};

  function render() {
    el.innerHTML = "";
    const head = h("div", { class: "learn-head" }, h("h2", {}, view === "home" ? "Learn" : titleFor()));
    if (view !== "home") head.append(h("button", { type: "button", class: "small", onclick: () => go("home") }, "← All activities"));
    el.append(head);
    ({ home, lessons: lessonList, lesson: lessonRun, predict: predictRun, match: matchList, target: targetRun, name: nameRun, progress: progressView, words: wordsView })[view]();
  }
  const titleFor = () => ({ lessons: "Lessons", lesson: lesson?.title, predict: "Predict and reveal", match: "Match the look", target: target?.title, name: "Name the setup", progress: "Progress", words: "Lighting words" })[view] || "Learn";
  function go(v) { view = v; onSettle = null; stepState = {}; render(); el.scrollIntoView({ block: "nearest" }); }
  const draftTag = (it) => (it.draft ? h("span", { class: "draft-tag" }, "DRAFT") : null);
  const setScene = (scene, msg) => { history.replace(scene); ctx.selectFirst(); announce(msg || "The studio is set up. Undo goes back."); };

  // ----- Home -----
  function home() {
    const tile = (v, label, sub) => h("button", { type: "button", class: "learn-tile", onclick: () => go(v) }, h("strong", {}, label), h("span", {}, sub));
    el.append(h("div", { class: "learn-tiles" },
      tile("lessons", "Lessons", `${content.lessons.length} short guided lessons`),
      tile("predict", "Predict and reveal", "Guess what a change will do, then see"),
      tile("match", "Match the look", "Recreate a target portrait"),
      tile("name", "Name the setup", "High-key, low-key or three-point?"),
      tile("progress", "Progress", "What you've got the hang of"),
      tile("words", "Lighting words", "Every term, in plain words")));
  }

  // ----- Lessons -----
  function lessonList() {
    if (!content.lessons.length) { el.append(P("No lessons are published yet.")); return; }
    for (const L of content.lessons) {
      el.append(h("button", { type: "button", class: "learn-row", onclick: () => { lesson = L; step = 0; go("lesson"); } },
        h("strong", {}, L.title), draftTag(L), isLessonDone(L.id) ? h("span", { class: "done" }, "✓ done") : null,
        h("span", { class: "sub" }, `${L.minutes || 5} min · ${CONCEPTS[L.concept]?.label || ""}`)));
    }
  }
  function lessonRun() {
    const s = lesson.steps[step];
    el.append(h("p", { class: "step-count" }, `Step ${step + 1} of ${lesson.steps.length}`));
    const body = h("div", { class: "step" });
    el.append(body);
    let canNext = true;
    if (s.text) body.append(P(s.text));
    if (s.type === "setup") {
      body.append(h("button", { type: "button", class: "solid", onclick: () => { setScene(buildScene(s.scene, history.state), "Studio set up for this step. Undo goes back."); stepState.done = true; render(); } }, stepState.done ? "Set up again" : "Set up the studio"));
      canNext = !!stepState.done;
    }
    if (s.type === "task") {
      const status = h("p", { class: "task-status", "aria-live": "polite" });
      body.append(status);
      const test = () => { const ok = checkAll(s.check, history.state, ctx.metrics(), ctx.metrics() && classify(ctx.metrics())); stepState.done = stepState.done || ok;
        status.textContent = ok ? "✓ Done! " + (s.success || "") : "Not yet. " + (stepState.hint ? s.hint : "Try it in the studio; this checks itself.");
        status.className = "task-status" + (ok ? " ok" : ""); nextBtn.disabled = !stepState.done && !stepState.skip; };
      onSettle = test;
      if (s.hint) body.append(h("button", { type: "button", class: "small", onclick: () => { stepState.hint = true; test(); } }, "Hint"));
      body.append(h("button", { type: "button", class: "small", onclick: () => { stepState.skip = true; test(); } }, "Skip this task"));
      canNext = !!stepState.done || !!stepState.skip;
      setTimeout(test, 0);
    }
    if (s.type === "predict" || s.type === "choose") canNext = askQuestion(body, s, `${lesson.id}:${step}`, lesson.concept);
    if (s.type === "reflect") {
      const id = `${lesson.id}:${step}`;
      body.append(P(s.prompt, "prompt"));
      if (s.frames?.length) body.append(h("details", { class: "frames", open: true }, h("summary", {}, "Sentence starters"), h("ul", {}, ...s.frames.map((f) => h("li", {}, f)))));
      const ta = h("textarea", { rows: 4, "aria-label": "Your answer", oninput: () => saveNote(id, ta.value) });
      ta.value = note(id);
      body.append(ta, h("p", { class: "hint" }, "Your writing stays on this computer. It isn't scored; your teacher reads it if you share your snapshot or a copy."));
    }
    const back = h("button", { type: "button", disabled: step === 0, onclick: () => { step--; stepState = {}; onSettle = null; render(); } }, "Back");
    const last = step === lesson.steps.length - 1;
    const nextBtn = h("button", { type: "button", class: "solid", disabled: !canNext, onclick: () => {
      if (last) { lessonDone(lesson.id); announce("Lesson finished."); go("lessons"); return; }
      step++; stepState = {}; onSettle = null; render(); } }, last ? "Finish lesson" : "Next");
    el.append(h("div", { class: "step-nav" }, back, nextBtn));
  }

  // A prediction or multiple-choice question. Predictions are answered first, then the change
  // is made in the studio and the result revealed. Returns whether "Next" can be pressed.
  function askQuestion(body, q, itemId, concept, after) {
    body.append(P(q.question, "prompt"));
    const name = "q" + Math.random().toString(36).slice(2);
    const opts = q.options.map((o, i) => h("label", { class: "opt" }, h("input", { type: "radio", name, value: i, disabled: stepState.answered != null }), " ", linkify(o)));
    body.append(h("div", { class: "opts", role: "radiogroup" }, ...opts));
    if (stepState.answered != null) opts[stepState.answered].querySelector("input").checked = true;
    const feedback = h("div", { class: "reveal", "aria-live": "polite" });
    const lock = h("button", { type: "button", class: "solid", disabled: stepState.answered != null, onclick: () => {
      const picked = opts.findIndex((o) => o.querySelector("input").checked);
      if (picked < 0) { announce("Pick an answer first."); return; }
      stepState.answered = picked;
      render();   // redraws with the answer revealed (and Next enabled)
    } }, q.type === "predict" || q.change ? "Lock in my prediction" : "Check");
    body.append(lock, feedback);
    function reveal() {
      const ok = stepState.answered === q.answer;
      if (!stepState.recorded) { record(concept || q.concept, itemId, ok); stepState.recorded = true; }
      feedback.innerHTML = "";
      feedback.append(h("p", { class: ok ? "right" : "wrong" }, ok ? "✓ Your prediction was right." : `Not quite: the answer is "${q.options[q.answer]}".`), P(q.explain || ""));
      if (stepState.before && ctx.metrics()) {
        const b = stepState.before, a = ctx.metrics();
        feedback.append(P(`Shadow side: ${b.shadowStops.toFixed(1)} → ${a.shadowStops.toFixed(1)} stops darker than the lit side. Backdrop: ${word(b.backdropMean)} → ${word(a.backdropMean)}.`, "measure"));
      }
      after?.(ok);
    }
    if (stepState.answered != null && (q.type === "predict" || q.change)) {
      if (!stepState.changed) {
        body.append(h("button", { type: "button", class: "solid", onclick: () => {
          stepState.before = ctx.metrics();
          history.change((s) => { Object.assign(s, applyPatch(s, q.change)); });
          stepState.changed = true;
          announce("Change made. Look at the picture.");
          onSettle = () => { onSettle = null; render(); };
        } }, "Make the change in the studio"));
      } else reveal();
    } else if (stepState.answered != null) reveal();
    return stepState.recorded === true;
  }
  const word = (v) => (v < 0.12 ? "dark" : v < 0.6 ? "grey" : "bright");

  // ----- Predict and reveal -----
  let pq = null;
  function predictRun() {
    if (!content.predict.length) { el.append(P("No questions are published yet.")); return; }
    if (!pq) pq = shuffle(content.predict)[0];
    el.append(draftTag(pq) || "");
    if (!stepState.setup) {
      el.append(P(pq.intro || "First, set up the studio for this question."),
        h("button", { type: "button", class: "solid", onclick: () => { setScene(buildScene(pq.scene)); stepState.setup = true; render(); } }, "Set up the studio"));
      return;
    }
    const body = h("div", { class: "step" });
    el.append(body);
    askQuestion(body, { ...pq, type: "predict" }, pq.id, pq.concept);
    if (stepState.recorded) el.append(h("button", { type: "button", class: "solid", onclick: () => { const rest = content.predict.filter((x) => x !== pq); pq = shuffle(rest.length ? rest : content.predict)[0]; stepState = {}; render(); } }, "Next question"));
  }

  // ----- Match the look -----
  let target = null;
  function matchList() {
    if (!content.targets.length) { el.append(P("No targets are published yet.")); return; }
    for (const t of content.targets) {
      el.append(h("button", { type: "button", class: "learn-row", onclick: () => { target = t; go("target"); } },
        h("strong", {}, t.title), draftTag(t), h("span", { class: "sub" }, `${"●".repeat(t.difficulty || 1)}${"○".repeat(3 - (t.difficulty || 1))} · ${t.brief || ""}`)));
    }
  }
  function targetRun() {
    const t = target;
    const scene = buildScene(t.targetScene);
    if (!t._img) { t._img = ctx.imageOf(scene); t._metrics = ctx.measureScene(scene); }
    el.append(draftTag(t) || "", P(t.brief || ""), h("img", { class: "target-img", src: t._img, alt: "The target portrait to match" }));
    const row = h("div", { class: "btn-row" },
      h("button", { type: "button", class: "small", onclick: () => ctx.compareWith(t._img, "Target") }, "Show target over my picture"),
      h("button", { type: "button", class: "small", onclick: () => { setScene(buildScene(t.start || { preset: "blank" }), "Fresh studio. Undo goes back."); } }, "Start from a blank studio"));
    el.append(row);
    const results = h("div", { class: "match-results", "aria-live": "polite" });
    el.append(h("button", { type: "button", class: "solid", onclick: () => { results.innerHTML = ""; results.append(...score(t)); } }, "Check my match"), results);
    // Hints, one property at a time; peeking at the setup is allowed but noted.
    const hints = t.hints || [];
    const hintBox = h("div");
    const showHint = () => { stepState.hints = (stepState.hints || 0) + 1; hintBox.innerHTML = ""; hints.slice(0, stepState.hints).forEach((x) => hintBox.append(P("Hint: " + x, "hint-line"))); hintBtn.disabled = stepState.hints >= hints.length; };
    const hintBtn = h("button", { type: "button", class: "small", disabled: !hints.length, onclick: showHint }, "Show a hint");
    const peekBtn = h("button", { type: "button", class: "small", onclick: () => { recordPeek(t.id); peekBox.innerHTML = ""; describe(scene, t._metrics).forEach((l) => peekBox.append(P(l))); peekBtn.textContent = "Peeked (noted)"; } }, peeked(t.id) ? "Peek again (noted)" : "Peek at the setup");
    const peekBox = h("div", { class: "peek" });
    el.append(h("div", { class: "btn-row" }, hintBtn, peekBtn), hintBox, peekBox);
    if (t.careerConnection) el.append(h("div", { class: "career" }, h("strong", {}, "Career connection: " + t.careerConnection.title), P(t.careerConnection.text)));
  }
  // Score by measured properties (never raw pixels): full credit inside the "full" band, half
  // inside "partial". Several different setups can match one target; that's correct.
  function score(t) {
    const mine = ctx.metrics(), want = t._metrics;
    if (!mine) return [P("Hold on: the picture is still being measured. Try again in a moment.")];
    const out = [];
    let pts = 0, n = 0;
    for (const [k, spec] of Object.entries(t.metrics || {})) {
      n++;
      if (k === "keySide") {
        const ok = mine.keySide === want.keySide;
        pts += ok ? 1 : 0;
        out.push(h("p", { class: ok ? "right" : "wrong" }, ok ? "✓ Brightest side: matches." : "", ok ? "" : linkify("✗ " + (spec.ifWrong || "The brightest side is on the other side from the target. Where is the key light?"))));
        continue;
      }
      const target = spec.target ?? want[k], d = mine[k] - target, ad = Math.abs(d);
      const full = ad <= spec.full, part = !full && ad <= spec.partial;
      pts += full ? 1 : part ? 0.5 : 0;
      const label = { shadowStops: "Shadow depth", backdropMean: "Backdrop brightness", overallMean: "Overall brightness", faceMean: "Face brightness", rimScore: "Rim light", colorCast: "Colour" }[k] || k;
      const ask = full ? "" : d < 0 ? spec.ifTooLow : spec.ifTooHigh;
      out.push(h("p", { class: full ? "right" : part ? "close" : "wrong" }, `${full ? "✓" : part ? "≈" : "✗"} ${label}: ${full ? "matches." : part ? "close. " : ""}`, ask ? linkify(ask) : ""));
    }
    const whole = pts === n;
    record(t.concept || "reading", t.id, whole);
    out.unshift(h("p", { class: "score" }, whole ? "You matched the look! There's more than one way to do it." : `${pts} of ${n} matched.`));
    return out;
  }

  // ----- Name the setup -----
  let nq = null;
  function nameRun() {
    if (!content.quizzes.length) { el.append(P("No scenes are published yet.")); return; }
    if (!nq) nq = shuffle(content.quizzes)[0];
    if (!nq._img) { const sc = buildScene(nq.scene); nq._img = ctx.imageOf(sc); nq._cls = classify(ctx.measureScene(sc)); }
    el.append(draftTag(nq) || "", h("img", { class: "target-img", src: nq._img, alt: "A portrait to name" }),
      P("Use the three clues: 1. Shadows (deep or soft?) 2. Background (one clue only) 3. Brightest side."));
    const pick = (group, labels) => {
      const name = "n" + Math.random().toString(36).slice(2);
      return h("div", { class: "opts", role: "radiogroup", "aria-label": group }, ...labels.map(([v, l]) => h("label", { class: "opt" }, h("input", { type: "radio", name, value: v, disabled: !!stepState.done }), " ", linkify(l))));
    };
    const setupOpts = pick("Which setup is it?", Object.entries(CLASSES).map(([k, c]) => [k, `${c.label}: ${c.short}`]));
    const clueOpts = pick("Which clue decided it?", [["shadows", "Shadows"], ["background", "Background"], ["brightest", "Brightest side"]]);
    const out = h("div", { class: "reveal", "aria-live": "polite" });
    el.append(P("Which setup is it?", "prompt"), setupOpts, P("Which clue decided it?", "prompt"), clueOpts,
      h("button", { type: "button", class: "solid", disabled: !!stepState.done, onclick: () => {
        const a = setupOpts.querySelector("input:checked")?.value, c = clueOpts.querySelector("input:checked")?.value;
        if (!a || !c) { announce("Pick a setup and a clue."); return; }
        stepState.done = true;
        const ok = a === nq._cls.id, clueOk = c === "shadows";
        record("reading", nq.id, ok && clueOk); record("styles", nq.id, ok);
        out.append(h("p", { class: ok ? "right" : "wrong" }, ok ? `✓ Yes: ${nq._cls.label}.` : `It's ${nq._cls.label}.`),
          ...nq._cls.reasons.map((r) => P(r)), nq._cls.note ? P(nq._cls.note) : "",
          P(clueOk ? "✓ Shadows decide it; the background is only a clue." : "The shadows decide it. The background is a clue, not the answer: look at how dark the shadow side is."));
        el.append(h("button", { type: "button", class: "solid", onclick: () => { const rest = content.quizzes.filter((x) => x !== nq); nq = shuffle(rest.length ? rest : content.quizzes)[0]; stepState = {}; render(); } }, "Next portrait"));
        for (const i of el.querySelectorAll(".opts input")) i.disabled = true;
      } }, "Check"), out);
  }

  // ----- Progress and words -----
  function progressView() {
    el.append(P("Each concept fills as you reason correctly on different scenes. No points, no timer."));
    for (const [k, c] of Object.entries(CONCEPTS)) {
      const m = mastery(k);
      el.append(h("div", { class: "mastery" }, h("span", { class: "m-label" }, c.label),
        h("span", { class: "m-bar", role: "img", "aria-label": `${c.label}: ${m.word}, ${m.distinct} of ${m.needed} different scenes` }, h("span", { class: "m-fill", style: `width:${m.level * 100}%` })),
        h("span", { class: "m-word" }, m.word)));
    }
  }
  function wordsView() {
    const seen = new Set();
    for (const t of Object.values(vocabTerms() || {})) {
      if (seen.has(t.word)) continue; seen.add(t.word);
      el.append(h("p", { class: "word" }, h("strong", {}, t.word[0].toUpperCase() + t.word.slice(1)), ": " + t.def, t.draft ? h("span", { class: "draft-tag" }, "DRAFT") : null));
    }
  }

  render();
  return {
    // Called when the studio picture settles (after the metrics are measured).
    settled() { onSettle?.(); },
    open(v) { go(v || "home"); },
  };
}
