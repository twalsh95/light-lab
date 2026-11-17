// Setup classifier (brief section 5.3), for Name the setup and for labelling targets.
// The main signal is shadow depth (shadowStops). Backdrop and overall brightness only
// support it: the backdrop is a clue, not the answer.
//
// Thresholds, calibrated on Tom's 7 reference renders and on the app's own presets
// (docs/PHASE4_CLASSIFIER.md has the numbers). PENDING TOM'S APPROVAL.
export const THRESHOLDS = {
  highKeyMaxStops: 0.4,      // shadow side within 0.4 stop of the lit side (fill nearly matches key)
  highKeyMinBackdrop: 0.6,   // and a bright backdrop...
  highKeyMinOverall: 0.6,    // ...and a bright picture overall
  lowKeyMinStops: 2.5,       // shadow side 2.5+ stops darker (about 6:1 or more): little or no fill
  brightBackdrop: 0.6,       // for the "dramatic light on a bright backdrop" note
};

export const CLASSES = {
  "high-key": { label: "High-key", short: "bright, even, few shadows" },
  "low-key": { label: "Low-key", short: "dark and dramatic, deep shadows" },
  balanced: { label: "Balanced three-point", short: "a clear key side, with fill softening the shadows" },
};

// Returns { id, label, note, clue, reasons[] }. `clue` is the one that decided it, in the
// words of the lesson: shadows, background, or brightest side.
export function classify(m, t = THRESHOLDS) {
  const ratio = Math.pow(2, m.shadowStops);
  const ratioText = ratio < 1.15 ? "almost the same as the lit side" : `about ${m.shadowStops.toFixed(1)} stops darker (${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}:1)`;
  const reasons = [`Shadows: the shadow side is ${ratioText}.`,
    `Background: ${m.backdropMean >= t.brightBackdrop ? "bright" : m.backdropMean < 0.12 ? "dark" : "middle grey"}.`,
    `Brightest side: picture-${m.keySide} (${m.keySide === "left" ? "camera-left" : "camera-right"}).`];
  if (m.shadowStops >= t.lowKeyMinStops) {
    const bright = m.backdropMean >= t.brightBackdrop;
    return { id: "low-key", label: CLASSES["low-key"].label, clue: "shadows", reasons,
      note: bright ? "Dramatic, one-sided light on a bright backdrop. Photographers argue about whether to call this low-key; the shadows say it is." : "" };
  }
  if (m.shadowStops <= t.highKeyMaxStops && m.backdropMean >= t.highKeyMinBackdrop && m.overallMean >= t.highKeyMinOverall) {
    return { id: "high-key", label: CLASSES["high-key"].label, clue: "shadows", reasons, note: "" };
  }
  const darkBackdrop = m.backdropMean < 0.12;
  return { id: "balanced", label: CLASSES.balanced.label, clue: "shadows", reasons,
    note: darkBackdrop ? "The backdrop is dark, but the shadows are soft. A dark backdrop alone doesn't make it low-key." :
      m.shadowStops <= t.highKeyMaxStops ? "The light is even, but the picture isn't bright overall, so it isn't high-key." : "" };
}
