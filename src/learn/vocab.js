// Vocabulary tips: wherever a lighting word appears in lesson text, feedback or the scene
// description, it gets a dotted underline and a plain definition on hover or keyboard focus
// (read by screen readers too). Definitions live in data/vocab.json.
let TERMS = null, MATCH = null;

export async function loadVocab(url = new URL("../../data/vocab.json", import.meta.url)) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Couldn't load the word list (" + r.status + ").");
  const data = await r.json();
  TERMS = {};
  for (const [word, t] of Object.entries(data.terms)) {
    TERMS[word.toLowerCase()] = { word, ...t };
    for (const a of t.also || []) TERMS[a.toLowerCase()] = { word, ...t };
  }
  const alts = Object.keys(TERMS).sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  MATCH = new RegExp(`\\b(${alts.join("|")})\\b`, "gi");
  return data;
}
export const vocabTerms = () => TERMS;

let uid = 0;
export function termSpan(text, entry) {
  const id = "tip" + ++uid;
  const s = document.createElement("span");
  s.className = "term"; s.tabIndex = 0; s.textContent = text;
  s.setAttribute("aria-describedby", id);
  const tip = document.createElement("span");
  tip.className = "term-tip"; tip.id = id; tip.setAttribute("role", "tooltip");
  tip.textContent = `${entry.word[0].toUpperCase() + entry.word.slice(1)}: ${entry.def}`;
  s.appendChild(tip);
  return s;
}

// Text -> fragment with each term's first appearance turned into a tip.
export function linkify(text) {
  const frag = document.createDocumentFragment();
  if (!MATCH) { frag.append(text); return frag; }
  const seen = new Set();
  let last = 0;
  text.replace(MATCH, (m, _g, i) => {
    const entry = TERMS[m.toLowerCase()];
    if (!entry || seen.has(entry.word)) return m;
    seen.add(entry.word);
    frag.append(text.slice(last, i), termSpan(m, entry));
    last = i + m.length;
    return m;
  });
  frag.append(text.slice(last));
  return frag;
}
