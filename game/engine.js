// Investigation engine (format v3, see game/FORMAT.md). Nodes open with keys handed over by unlocks,
// reconstructions with their exact (moment, place, people), puzzle rewards with their answer.

const S = window.STORY;
const $ = id => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const SAVE = "enquete-save-v5";

// ---- Crypto (must match tools/build_story.py) ----
// Pure JS SHA-256: WebCrypto is missing on plain-HTTP pages
const K256 = [...Array(64)].map((_, i) => {
  let n = 2, c = 0;
  for (;; n++) { let p = true; for (let d = 2; d * d <= n; d++) if (n % d === 0) { p = false; break; } if (p && c++ === i) break; }
  return (Math.cbrt(n) % 1) * 2 ** 32 >>> 0;
});
function sha256(msg) {
  const len = msg.length, total = ((len + 9 + 63) >> 6) << 6, m = new Uint8Array(total);
  m.set(msg); m[len] = 0x80;
  const bits = len * 8; for (let i = 0; i < 8; i++) m[total - 1 - i] = Math.floor(bits / 2 ** (8 * i)) & 255;
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Uint32Array(64);
  const r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) >>> 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      k = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, k].forEach((v, i) => { h[i] = (h[i] + v) >>> 0; });
  }
  const out = new Uint8Array(32);
  h.forEach((v, i) => { out[4 * i] = v >>> 24; out[4 * i + 1] = (v >>> 16) & 255; out[4 * i + 2] = (v >>> 8) & 255; out[4 * i + 3] = v & 255; });
  return out;
}
const sha = async bytes => sha256(typeof bytes === "string" ? enc.encode(bytes) : bytes);
const cat = (...a) => { const r = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; a.forEach(x => { r.set(x, o); o += x.length; }); return r; };
const hex = b => [...b].map(x => x.toString(16).padStart(2, "0")).join("");
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const keyOf = (kind, parts) => sha([kind, ...parts].join("|"));
const idOf = async k => hex(await sha(cat(enc.encode("id|"), k))).slice(0, 16);
async function decrypt(k, b64) {
  const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), out = new Uint8Array(data.length);
  for (let i = 0; i * 32 < data.length; i++) {
    const ks = await sha(cat(k, new Uint8Array([i >>> 24, (i >>> 16) & 255, (i >>> 8) & 255, i & 255])));
    for (let j = 0; j < 32 && i * 32 + j < data.length; j++) out[i * 32 + j] = data[i * 32 + j] ^ ks[j];
  }
  return JSON.parse(dec.decode(out));
}
async function open(table, k) { const id = await idOf(k); return table[id] ? decrypt(k, table[id]) : null; }
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

// ---- State ----
const fresh = () => ({ keys: [], skeys: [], done: [], asked: [], moments: [], places: [], known: [], labels: {}, guess: {}, ok: [], solved: [], notes: "", pins: [], ending: null, finalOpen: false, seenIntro: false, reached: [], feed: [] });
let st = fresh(), N = {}, order = [], R = {};          // decrypted nodes by id (in unlock order), reconstructions by id
const ui = { section: "journal", moment: null, room: null, pick: new Set(), view: null, flt: { moment: "", place: "", a: "", b: "" } };
const novel = new Set(), messages = [], hintCache = new Map();
function save() { try { localStorage.setItem(SAVE, JSON.stringify(st)); } catch (e) { /* storage unavailable */ } }
const add = (arr, xs = []) => xs.forEach(x => { if (!arr.includes(x)) arr.push(x); });

async function addNode(h) {
  const n = await open(S.nodes, unhex(h));
  if (!n || N[n.id]) return;
  N[n.id] = n; order.push(n.id); add(st.keys, [h]);
  if (n.type === "talk") add(st.known, [n.person]);
}
// Each unlock source (chapter, object, topic, reconstruction, puzzle) applies once
async function applyUnlock(src, u = {}) {
  if (st.done.includes(src)) return;
  st.done.push(src);
  for (const h of u.nodes || []) await addNode(h);
  add(st.places, u.places); add(st.moments, u.moments); add(st.known, u.people);
  // Places opened by the first chapter are reachable at once; later ones need a rover trip
  if (src === "n:" + nodes("chapter")[0]?.id) add(st.reached, u.places);
  if (u.final) st.finalOpen = true;
  if (u.message) messages.push([].concat(u.message));
}
async function load(data) {
  st = Object.assign(fresh(), data); N = {}; order = []; R = {};
  if (!data.reached) st.reached = [...st.places];
  for (const h of [...st.keys]) await addNode(h);
  for (const h of st.skeys) { const s = await open(S.scenes, unhex(h)); if (s) R[s.id] = s; }
}
async function newGame() { await load(fresh()); for (const h of S.start) await addNode(h); save(); }

// ---- Helpers (el and rand come from assets/puzzles.js) ----
const nodes = type => order.map(id => N[id]).filter(n => n.type === type);
const moments = () => S.moments.filter(m => !m.locked || st.moments.includes(m.id));
const places = () => S.places.filter(p => !p.locked || st.places.includes(p.id));
const reached = id => !S.places.find(p => p.id === id)?.locked || st.reached.includes(id);
const momentIdx = id => S.moments.findIndex(m => m.id === id);
const momentLabel = id => S.moments.find(m => m.id === id)?.label ?? id;
const placeLabel = id => S.places.find(p => p.id === id)?.label ?? id;
const sceneAt = (m, p) => Object.values(R).find(s => s.moment === m && s.place === p);
const sortedScenes = () => Object.values(R).sort((a, b) => momentIdx(a.moment) - momentIdx(b.moment) || S.places.findIndex(p => p.id === a.place) - S.places.findIndex(p => p.id === b.place));
const optLabel = (f, i) => { const o = S.fields[f].options[i]; return typeof o === "string" ? o : o.label; };
const who = p => (p === 0 ? "" : p === -1 ? "Vous" : st.ok.includes(p) ? optLabel(0, st.guess[p][0]) : st.labels[p] || S.people[p]?.aka || `#${p}`);
const nameEl = (tag, cls, p) => { const e = el(tag, cls, who(p)); e.dataset.p = p; return e; };
const refreshNames = () => document.querySelectorAll("[data-p]").forEach(e => { e.textContent = who(+e.dataset.p); });
const talkOf = p => nodes("talk").find(n => n.person === p);
const held = id => !!N[id];
async function hint(m, p) {
  const k = m + "|" + p;
  if (!hintCache.has(k)) hintCache.set(k, S.hints[hex(await sha(`hint|${m}|${p}`)).slice(0, 16)]);
  return hintCache.get(k);
}
const svgNS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(svgNS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// Procedural portrait from the person number and optional look hints
function portrait(p, cls = "") {
  let seed = (p * 2654435761) >>> 0;
  const r = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32, pick = a => a[Math.floor(r() * a.length)];
  const L = S.people[p]?.look || {};
  const skin = L.skin || pick(["#f1c7a5", "#d9a27b", "#a86f4c", "#7a4a2e", "#e8b894", "#c68e64"]);
  const hair = L.hair || pick(["short", "long", "bun", "curly", "bald", "helmet"]);
  const hc = L.hair_color || pick(["#2b1b12", "#6b3b1f", "#c9a15a", "#b0413e", "#d8d8d8", "#111"]);
  const out = L.outfit || pick(["#e5383b", "#d4a24c", "#3a7ca5", "#5a8f5a", "#8a5fbf", "#777"]);
  const shapes = {
    short: `<path d="M11.5 17C11 8 29 8 28.5 17C27 11.5 13 11.5 11.5 17Z" fill="${hc}"/>`,
    long: `<path d="M11 19C9.5 7 30.5 7 29 19L30 30L26 28L26.5 15C22 11.5 18 11.5 13.5 15L14 28L10 30Z" fill="${hc}"/>`,
    bun: `<path d="M11.5 17C11 8 29 8 28.5 17C27 11.5 13 11.5 11.5 17Z" fill="${hc}"/><circle cx="20" cy="7.5" r="3.6" fill="${hc}"/>`,
    curly: [12, 15, 19, 23, 27, 28.5, 11].map((x, i) => `<circle cx="${x}" cy="${i > 4 ? 15 : 10 + (i % 2)}" r="3.6" fill="${hc}"/>`).join(""),
    bald: "", helmet: "",
  };
  const helmet = hair === "helmet" ? `<circle cx="20" cy="18" r="12.5" fill="rgba(150,210,230,.12)" stroke="#9cd" stroke-width="1.2"/><path d="M12 13Q20 7 28 13" stroke="#fff" stroke-opacity=".4" fill="none"/>` : "";
  const s = el("span", "portrait " + cls);
  s.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#1c1410"/>
    <path d="M5 41C5 31 13 27.5 20 27.5C27 27.5 35 31 35 41Z" fill="${out}"/><rect x="17.5" y="22" width="5" height="6" fill="${skin}"/>
    <circle cx="20" cy="18" r="8" fill="${skin}"/>${shapes[hair] || ""}
    <circle cx="17" cy="18.5" r=".9" fill="#1a1a1a"/><circle cx="23" cy="18.5" r=".9" fill="#1a1a1a"/>${helmet}</svg>`;
  return s;
}

// ---- Discoveries: toast, sound, highlights ----
const snap = () => ({ n: new Set(order), l: new Set(st.places), m: new Set(st.moments), p: new Set(st.known), f: st.finalOpen });
const KIND = { chapter: "Chapitre", search: "Fouille", talk: "Interrogatoire", evidence: "Preuve", puzzle: "Énigme" };
function announce(b) {
  const items = [];
  order.filter(id => !b.n.has(id)).forEach(id => { novel.add("n:" + id); items.push(`${KIND[N[id].type]} · ${N[id].title}`); });
  st.places.filter(x => !b.l.has(x)).forEach(x => { novel.add("l:" + x); items.push(`Lieu · ${placeLabel(x)}`); });
  st.moments.filter(x => !b.m.has(x)).forEach(x => { novel.add("m:" + x); items.push(`Moment · ${momentLabel(x)}`); });
  const np = st.known.filter(x => !b.p.has(x)); np.forEach(x => novel.add("p:" + x));
  if (np.length) items.push(`${np.length} dossier${np.length > 1 ? "s" : ""} ouvert${np.length > 1 ? "s" : ""}`);
  if (st.finalOpen && !b.f) items.push("Conclusion disponible");
  if (items.length) { toast(items); setTimeout(() => sfx("discover"), 250); st.feed = [...items, ...st.feed].slice(0, 10); save(); }
}
async function discover(fn) {
  const b = snap(); await fn(); save(); announce(b); renderNav(); renderPane();
  while (messages.length) await notice(messages.shift());
}
function toast(items) {
  const t = el("div", "toast");
  t.append(el("div", "mono gold", "▸ NOUVEAU"), ...items.map(x => el("div", "", x)));
  $("toasts").append(t);
  setTimeout(() => t.classList.add("out"), 4200); setTimeout(() => t.remove(), 4800);
}
function notice(paragraphs) {
  return new Promise(res => {
    $("notice-text").replaceChildren(...paragraphs.map(p => el("p", "", p)));
    $("notice").showModal(); $("notice").addEventListener("close", res, { once: true });
  });
}

// ---- Navigation ----
const SECTIONS = [["journal", "Journal"], ["carte", "Carte"], ["dossiers", "Dossiers"], ["preuves", "Preuves"], ["enigmes", "Énigmes"], ["carnet", "Carnet"], ["conclusion", "Conclusion"]];
const NEWS = {
  journal: () => order.some(id => N[id].type === "chapter" && novel.has("n:" + id)),
  carte: () => [...novel].some(k => k.startsWith("l:") || k.startsWith("m:") || (k.startsWith("n:") && N[k.slice(2)]?.type === "search")),
  dossiers: () => [...novel].some(k => k.startsWith("p:") || (k.startsWith("n:") && N[k.slice(2)]?.type === "talk")),
  preuves: () => nodes("evidence").some(n => novel.has("n:" + n.id)),
  enigmes: () => nodes("puzzle").some(n => novel.has("n:" + n.id)),
};
const SHOWN = { enigmes: () => nodes("puzzle").length > 0, preuves: () => nodes("evidence").length > 0, conclusion: () => st.finalOpen || !!st.ending };
// Investigation counters in the header: progress counters (each opens its section) and the latest discoveries
function renderStrip() {
  const signals = places().filter(p => !reached(p.id)).length;
  const stats = [
    ["dossiers", "▣", "Fiches confirmées", `${st.ok.length}/${Object.keys(S.people).length}`],
    ["journal", "◉", "Reconstitutions", `${Object.keys(R).length}/${Object.keys(S.scenes).length}`],
    ["carte", "⌖", "Lieux atteints" + (signals ? ` (+${signals} signal${signals > 1 ? "s" : ""} à rejoindre)` : ""), `${places().length - signals}` + (signals ? `+${signals}` : "")],
    ["carte", "◷", "Moments", `${moments().length}`],
    ["preuves", "▤", "Preuves", `${nodes("evidence").length}`],
    ["enigmes", "✦", "Énigmes résolues", `${st.solved.length}/${Object.keys(S.answers).length}`],
  ];
  $("stats").replaceChildren(...stats.map(([sec, icon, label, v]) => {
    const b = el("button", "stat"); b.title = label; b.setAttribute("aria-label", `${label} : ${v}`);
    b.append(el("span", "k", icon), el("span", "v", v));
    b.onclick = () => go(sec); return b;
  }));
  const feed = st.feed.length ? st.feed : ["En attente de premières observations"];
  const t = $("ticker-text"), text = "▸ " + feed.join("   ▸ ") + "   ";
  if (t.dataset.v !== text) { t.dataset.v = text; t.textContent = text + text; t.style.animationDuration = `${Math.max(20, text.length / 4)}s`; }
}
function renderNav() {
  renderStrip();
  $("sections").replaceChildren(...SECTIONS.filter(([id]) => !SHOWN[id] || SHOWN[id]()).map(([id, label]) => {
    const b = el("button", ui.section === id ? "on" : "", label);
    if (NEWS[id]?.()) b.append(el("span", "pip"));
    b.onclick = () => go(id);
    return b;
  }));
}
function go(section) {
  ui.section = section; sfx("tick"); renderNav(); renderPane();
  const pane = $("pane"); pane.classList.add("wipe"); clearTimeout(go.t); go.t = setTimeout(() => pane.classList.remove("wipe"), 450);
}

let paneToken = 0;
async function renderPane() {
  const token = ++paneToken, box = el("div", "pane-in");
  await ({ journal: renderJournal, carte: renderMap, dossiers: renderDossiers, preuves: renderEvidence, enigmes: renderPuzzles, carnet: renderNotebook, conclusion: renderFinal })[ui.section](box);
  if (token === paneToken) $("pane").replaceChildren(box);
}
const item = (label, onclick, key, on, sub) => {
  const b = el("button", "item" + (on ? " on" : "") + (key && novel.has(key) ? " new" : ""));
  b.append(el("span", "", label)); if (sub) b.append(el("span", "muted", sub));
  b.onclick = () => { if (key) novel.delete(key); onclick(); renderNav(); };
  return b;
};

// ---- Reader ----
function reader(kind, title, ...children) {
  const r = $("reader"), head = el("header", "rhead");
  head.append(el("div", "mono kicker", kind), el("h2", "", title));
  r.replaceChildren(head, ...children);
  r.scrollTop = 0;
  if (matchMedia("(max-width: 900px)").matches) r.scrollIntoView({ behavior: "smooth", block: "start" });
}
const paras = (list, cls = "prose") => { const d = el("div", cls); (list || []).forEach((t, i) => { const p = el("p", "", t); p.style.animationDelay = `${Math.min(i, 12) * 60}ms`; d.append(p); }); return d; };
function line(sp, text, i, ref) {
  const p = el("p", sp === 0 ? "line narr" : sp === -1 ? "line me" : "line");
  p.style.animationDelay = `${Math.min(i, 20) * 35}ms`;
  // Fixed avatar column so every reply starts at the same x: portrait, the lieutenant's badge, or an empty slot for narration
  p.append(sp > 0 ? portrait(sp, "tiny") : el("span", sp === -1 ? "badge mono" : "slot", sp === -1 ? "LT" : ""));
  if (sp) p.append(nameEl("span", "who", sp));
  p.append(el("span", "say", text));
  p.title = "Épingler dans le carnet";
  p.onclick = () => {
    if (st.pins.some(x => x.t === text)) return;
    st.pins.push({ t: text, sp, ref }); save(); sfx("pin"); p.classList.add("hit");
    toast(["Réplique épinglée dans le carnet"]);
  };
  return p;
}
const link = (text, onclick, p) => { const b = p ? nameEl("button", "link", p) : el("button", "link", text); b.onclick = onclick; return b; };
function follow(f) { Object.assign(ui.flt, { moment: "", place: "", a: "", b: "" }, f); go("journal"); }

async function openChapter(id) {
  const n = N[id]; ui.view = { id }; novel.delete("n:" + id);
  const order = [];
  if (id === nodes("chapter")[0]?.id && S.intro?.length) {
    const m = el("div", "mission"); m.append(el("div", "mono kicker", "ORDRE DE MISSION · transmission Terre"), paras(S.intro)); order.push(m);
  }
  reader("CHAPITRE", n.title, ...order, paras(n.text, "prose book"));
  await discover(() => applyUnlock("n:" + id, n.unlock));
}
function showScene(id, hit = -1) {
  const s = R[id]; ui.view = { id };
  const where = el("div", "mono gold");
  where.append(link(momentLabel(s.moment), () => follow({ moment: s.moment })), " · ", link(placeLabel(s.place), () => follow({ place: s.place })));
  const present = el("div", "present", "Présents : ");
  s.people.forEach((p, k) => { if (k) present.append(", "); present.append(link("", () => follow({ a: String(p) }), p)); });
  const lines = el("div", "lines");
  s.lines.forEach(([sp, t], i) => { const l = line(sp, t, i, { v: "scene", id }); if (i === hit) l.classList.add("hit"); lines.append(l); });
  reader("RECONSTITUTION", s.title || "", where, present, lines);
  const r = $("reader"); r.classList.remove("scene-in"); void r.offsetWidth; r.classList.add("scene-in");
  if (hit >= 0) lines.children[hit]?.scrollIntoView({ block: "center" });
}
function openSearch(id) {
  const n = N[id]; ui.view = { id }; novel.delete("n:" + id);
  const list = el("div", "objects");
  n.objects.forEach((o, i) => {
    const src = `n:${id}#${i}`;
    if (st.done.includes(src)) {
      const c = el("div", "object seen"); c.append(el("h4", "", o.label), paras(o.text)); list.append(c);
    } else {
      const b = el("button", "object", "⌕ " + o.label);
      b.onclick = async () => { sfx("tick"); await discover(() => applyUnlock(src, o.unlock)); openSearch(id); };
      list.append(b);
    }
  });
  reader(`FOUILLE · ${placeLabel(n.place)}`, n.title, paras(n.text), list);
}
function openTalk(id, scroll = false) {
  const n = N[id]; ui.view = { id }; novel.delete("n:" + id);
  const head = el("div", "talker"); head.append(portrait(n.person, "big"), nameEl("strong", "", n.person));
  const log = el("div", "lines");
  st.asked.filter(a => a.startsWith(id + "#")).forEach(a => {
    const tp = n.topics[+a.split("#")[1]];
    log.append(el("p", "q mono", "› " + (tp.show ? `Montrer : ${N[tp.show]?.title}` : tp.q)));
    tp.lines.forEach(([sp, t], i) => log.append(line(sp, t, i, { v: "talk", id })));
  });
  const ask = el("div", "topics");
  n.topics.forEach((tp, i) => {
    const key = `${id}#${i}`;
    if (st.asked.includes(key) || (tp.show && !held(tp.show))) return;
    const b = el("button", "topic" + (tp.show ? " show" : ""), tp.show ? `Montrer : ${N[tp.show].title}` : tp.q);
    b.onclick = async () => { st.asked.push(key); sfx("tick"); await discover(() => applyUnlock("n:" + key, tp.unlock)); openTalk(id, true); };
    ask.append(b);
  });
  if (!ask.children.length) ask.append(el("p", "muted", "Plus rien à demander pour l'instant."));
  reader("INTERROGATOIRE", n.title, head, paras(n.text), log, ask);
  if (scroll) { const r = $("reader"); r.scrollTop = r.scrollHeight; }
}
function openEvidence(id) { const n = N[id]; ui.view = { id }; novel.delete("n:" + id); reader("PREUVE", n.title, paras(n.text)); renderNav(); }
function openRef(ref) { ({ scene: () => showScene(ref.id), talk: () => openTalk(ref.id), chapter: () => openChapter(ref.id) })[ref.v]?.(); }

// ---- Journal: chapters and reconstructions ----
function renderJournal(box) {
  box.append(el("h3", "", "Chapitres"));
  nodes("chapter").forEach(n => box.append(item(n.title, () => openChapter(n.id), "n:" + n.id, ui.view?.id === n.id)));
  box.append(el("h3", "", "Reconstitutions"));
  const all = sortedScenes(), f = ui.flt;
  const pick = (key, label, items) => {
    const s = el("select"); s.append(el("option", "", label)); s.firstChild.value = "";
    items.forEach(([v, t]) => { const o = el("option", "", t); o.value = v; s.append(o); });
    s.value = f[key]; if (s.value !== f[key]) f[key] = "";
    s.onchange = () => { f[key] = s.value; renderPane(); };
    return s;
  };
  if (!all.length) return box.append(el("p", "muted", "Aucune pour l'instant : sur la carte, choisissez un moment et une pièce où les capteurs ont vu des silhouettes."));
  const people = st.known.slice().sort((a, b) => a - b).map(p => [String(p), `${who(p)}${who(p) === `#${p}` ? "" : ` (#${p})`}`]);
  const bar = el("div", "filters");
  bar.append(pick("moment", "Tous les moments", S.moments.filter(m => all.some(s => s.moment === m.id)).map(m => [m.id, m.label])),
    pick("place", "Tous les lieux", S.places.filter(p => all.some(s => s.place === p.id)).map(p => [p.id, p.label])),
    pick("a", "Avec n'importe qui", people), pick("b", "… et aussi avec", people));
  const list = all.filter(s => (!f.moment || s.moment === f.moment) && (!f.place || s.place === f.place) && (!f.a || s.people.includes(+f.a)) && (!f.b || s.people.includes(+f.b)));
  const count = el("p", "muted", `${all.length} / ${Object.keys(S.scenes).length} reconstituées`);
  if (Object.values(f).some(Boolean)) count.append(` · ${list.length} affichée${list.length > 1 ? "s" : ""} · `, link("effacer les filtres", () => follow({})));
  box.append(bar, count);
  let last = null;
  list.forEach(s => {
    if (s.moment !== last) { box.append(el("h4", "", momentLabel(s.moment))); last = s.moment; }
    box.append(item(placeLabel(s.place), () => showScene(s.id), null, ui.view?.id === s.id, ` · ${s.title || ""}`));
  });
}

// ---- Map: timeline, rooms, searches, reconstructions ----
async function renderMap(box) {
  const ms = moments();
  if (!ms.some(m => m.id === ui.moment)) ui.moment = ms[0]?.id;
  const idx = ms.findIndex(m => m.id === ui.moment);
  const setMoment = i => { ui.moment = ms[i].id; novel.delete("m:" + ui.moment); ui.pick.clear(); sfx("tick"); renderNav(); renderPane(); };
  const tl = el("div", "timeline");
  const prev = el("button", "chip", "◀"), next = el("button", "chip", "▶"), slider = el("input");
  prev.disabled = idx <= 0; next.disabled = idx >= ms.length - 1;
  prev.onclick = () => setMoment(idx - 1); next.onclick = () => setMoment(idx + 1);
  Object.assign(slider, { type: "range", min: 0, max: Math.max(0, ms.length - 1), value: idx });
  slider.oninput = () => setMoment(+slider.value);
  const label = el("div", "mono gold now", momentLabel(ui.moment));
  if (ms.some(m => novel.has("m:" + m.id))) label.append(el("span", "pip"));
  tl.append(prev, label, next, slider);

  const svg = svgEl("svg", { viewBox: "0 0 100 60", class: "map" });
  svg.append(svgEl("rect", { x: 0, y: 0, width: 100, height: 60, fill: "url(#grid)" }));
  const defs = svgEl("defs"), pat = svgEl("pattern", { id: "grid", width: 5, height: 5, patternUnits: "userSpaceOnUse" });
  pat.append(svgEl("path", { d: "M5 0H0V5", fill: "none", stroke: "rgba(212,162,76,.08)", "stroke-width": .2 })); defs.append(pat); svg.prepend(defs);
  for (const p of places()) {
    if (!reached(p.id)) {
      const g = svgEl("g", { class: "room signal" + (ui.room === p.id ? " on" : "") });
      g.append(svgEl("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: 1.2 }));
      const t = svgEl("text", { x: p.x + 1.2, y: p.y + 3 }); t.textContent = "◌ " + p.label; g.append(t);
      const b = svgEl("text", { x: p.x + p.w - 1.2, y: p.y + p.h - 1.4, "text-anchor": "end", class: "badge" }); b.textContent = "⇢ rover"; g.append(b);
      g.onclick = () => { ui.room = p.id; novel.delete("l:" + p.id); sfx("tick"); renderNav(); renderPane(); };
      svg.append(g); continue;
    }
    const n = await hint(ui.moment, p.id), done = sceneAt(ui.moment, p.id), search = nodes("search").find(x => x.place === p.id);
    const g = svgEl("g", { class: "room" + (ui.room === p.id ? " on" : "") + (novel.has("l:" + p.id) ? " new" : "") + (n && !done ? " live" : "") + (done ? " done" : "") });
    g.append(svgEl("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: 1.2 }));
    const t = svgEl("text", { x: p.x + 1.2, y: p.y + 3 }); t.textContent = p.label; g.append(t);
    const badge = svgEl("text", { x: p.x + p.w - 1.2, y: p.y + p.h - 1.4, "text-anchor": "end", class: "badge" });
    badge.textContent = `${search && search.objects.some((_, i) => !st.done.includes(`n:${search.id}#${i}`)) ? "⌕ " : ""}${done ? "✓" : n ? "◉".repeat(Math.min(n, 6)) + (n > 6 ? "+" : "") : ""}`;
    g.append(badge);
    g.onclick = () => { ui.room = p.id; novel.delete("l:" + p.id); ui.pick.clear(); sfx("tick"); renderNav(); renderPane(); };
    svg.append(g);
  }
  const wrap = el("div", "mapwrap"); wrap.append(svg);
  box.append(tl, wrap, el("p", "muted legend", "◉ silhouette captée · ✓ reconstituée · ⌕ à fouiller · ◌ signal à rejoindre en rover"));
  if (ui.room && places().some(p => p.id === ui.room)) box.append(await roomPanel(ui.room));
  else box.append(el("p", "muted", "Touchez une pièce pour la fouiller ou reconstituer ce qui s'y est passé."));
}
async function roomPanel(pid) {
  const panel = el("div", "room-panel"), n = await hint(ui.moment, pid), done = sceneAt(ui.moment, pid);
  panel.append(el("h3", "", placeLabel(pid)));
  if (!reached(pid)) {
    const b = el("button", "btn", "⇢ Partir en rover");
    b.onclick = () => expedition(pid);
    panel.append(el("p", "", "Signal capté, mais personne de la police n'y est encore allé. Prenez un rover à la base et rejoignez la balise avant que la batterie ne lâche."), b);
    return panel;
  }
  const search = nodes("search").find(x => x.place === pid);
  if (search) { const b = el("button", "btn ghost", "⌕ Fouiller la pièce"); b.onclick = () => openSearch(search.id); panel.append(b); }
  if (done) { const b = el("button", "btn", "Revoir la reconstitution"); b.onclick = () => showScene(done.id); panel.append(el("p", "mono gold", `${momentLabel(ui.moment)} · reconstituée`), b); return panel; }
  if (!n) { panel.append(el("p", "muted", `${momentLabel(ui.moment)} : aucune activité enregistrée ici.`)); return panel; }
  panel.append(el("p", "", `${momentLabel(ui.moment)} : les capteurs ont enregistré ${n} silhouette${n > 1 ? "s" : ""}. Qui était là ?`));
  const q = el("input", "filter"); q.placeholder = "Filtrer les dossiers…";
  const chips = el("div", "chips"), count = el("span", "mono gold", ""), msg = el("p", "msg");
  const upd = () => { count.textContent = `${ui.pick.size} / ${n}`; };
  st.known.slice().sort((a, b) => a - b).forEach(p => {
    const c = el("button", "chip person-chip" + (ui.pick.has(p) ? " on" : "") + (novel.has("p:" + p) ? " new" : ""));
    c.append(portrait(p, "tiny"), nameEl("span", "", p)); c.dataset.q = norm(`${p} ${who(p)}`);
    c.onclick = () => { novel.delete("p:" + p); ui.pick.has(p) ? ui.pick.delete(p) : ui.pick.add(p); c.classList.toggle("on"); c.classList.remove("new"); sfx("tick"); upd(); };
    chips.append(c);
  });
  q.oninput = () => { const v = norm(q.value); chips.querySelectorAll(".chip").forEach(c => { c.hidden = v && !c.classList.contains("on") && !c.dataset.q.includes(v); }); };
  const rebuild = el("button", "btn", "Reconstituer");
  rebuild.onclick = async () => {
    const people = [...ui.pick].sort((a, b) => a - b), k = await keyOf("scene", [ui.moment, pid, people.join(",")]), s = await open(S.scenes, k);
    if (!s) { sfx("fail"); msg.textContent = ui.pick.size === n ? "Les signatures ne correspondent pas : quelqu'un n'est pas le bon." : `Il faut exactement ${n} personne${n > 1 ? "s" : ""}.`; msg.className = "msg warn"; return; }
    const r = rebuild.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 60); sfx("light");
    ui.pick.clear();
    // Sensor sync overlay before the scene appears
    const sync = el("div", "sync"), bar = el("div", "", "SYNCHRONISATION DES CAPTEURS"); bar.append(el("i")); sync.append(bar);
    document.body.append(sync); await new Promise(r => setTimeout(r, 850)); sync.remove();
    await discover(async () => { st.skeys.push(hex(k)); R[s.id] = s; add(st.known, s.people); await applyUnlock("r:" + s.id, s.unlock); });
    showScene(s.id);
  };
  const row = el("div", "row"); row.append(rebuild, count); upd();
  panel.append(q, chips, row, msg);
  return panel;
}

// ---- Dossiers: identity sheets ----
function renderDossiers(box) {
  const need = Math.min(3, Object.keys(S.people).length - st.ok.length), total = Object.keys(S.people).length;
  const q = el("input", "filter"); q.placeholder = "Filtrer (numéro, surnom, nom)…";
  const check = el("button", "btn", "Vérifier les fiches"), grid = el("div", "cards");
  box.append(el("h3", "", "Dossiers"), el("p", "muted", `Renommez chacun à votre guise, puis complétez ${S.fields.map(f => f.label.toLowerCase()).join(" + ")}. Les fiches justes se confirment par ${need || 3}. Identifiés : ${st.ok.length} / ${total}.`), q, grid, check);
  st.known.slice().sort((a, b) => a - b).forEach(p => {
    const done = st.ok.includes(p), card = el("div", "card-p" + (done ? " ok" : "") + (novel.has("p:" + p) ? " new" : ""));
    const g = st.guess[p] || (st.guess[p] = []);
    const top = el("div", "card-top"), label = el("input");
    label.placeholder = S.people[p]?.aka || "surnom"; label.value = st.labels[p] || "";
    label.oninput = () => { st.labels[p] = label.value.trim(); save(); refreshNames(); };
    top.append(portrait(p), el("span", "mono red", `#${p}`), label);
    const fields = el("div", "fields");
    S.fields.forEach((f, k) => {
      const s = el("select"); s.append(el("option", "", `— ${f.label.toLowerCase()} —`)); s.firstChild.value = "";
      const groups = {};
      f.options.forEach((o, i) => {
        const opt = el("option", "", optLabel(k, i)); opt.value = i;
        const grp = typeof o === "string" ? null : o.group;
        if (!grp) return s.append(opt);
        if (!groups[grp]) { groups[grp] = el("optgroup"); groups[grp].label = grp; s.append(groups[grp]); }
        groups[grp].append(opt);
      });
      s.value = g[k] ?? ""; s.disabled = done;
      s.onchange = () => { g[k] = s.value === "" ? null : +s.value; save(); };
      fields.append(s);
    });
    const acts = el("div", "acts"), talk = talkOf(p);
    if (talk) { const b = el("button", "chip" + (novel.has("n:" + talk.id) ? " new" : ""), "Interroger"); b.onclick = () => { novel.delete("n:" + talk.id); novel.delete("p:" + p); openTalk(talk.id); renderNav(); }; acts.append(b); }
    const sc = el("button", "chip", "Scènes"); sc.onclick = () => follow({ a: String(p) }); acts.append(sc);
    card.dataset.q = norm(`${p} ${who(p)} ${S.people[p]?.aka || ""}`);
    card.onpointerenter = () => { if (novel.delete("p:" + p)) { card.classList.remove("new"); renderNav(); } };
    card.append(top, fields, acts); grid.append(card);
  });
  q.oninput = () => { const v = norm(q.value); grid.querySelectorAll(".card-p").forEach(c => { c.hidden = v && !c.dataset.q.includes(v); }); };
  check.onclick = async () => {
    const good = [];
    for (const p of st.known) {
      const g = st.guess[p];
      if (st.ok.includes(p) || !g || S.fields.some((_, k) => g[k] === undefined || g[k] === null)) continue;
      if (S.who.includes(hex(await sha(`who|${p}|${g.slice(0, S.fields.length).join("|")}`)).slice(0, 16))) good.push(p);
    }
    if (need && good.length >= need) {
      st.ok.push(...good); save(); sfx("confirm");
      const r = check.getBoundingClientRect(); burst(r.left + r.width / 2, r.top, 50);
      toast([`${good.length} fiche${good.length > 1 ? "s" : ""} confirmée${good.length > 1 ? "s" : ""}`]); refreshNames(); renderPane();
    } else { sfx("fail"); toast([`Pas encore : il faut ${need} fiche${need > 1 ? "s" : ""} entièrement juste${need > 1 ? "s" : ""} à la fois.`]); }
  };
}

// ---- Evidence, puzzles, notebook, conclusion ----
function renderEvidence(box) {
  box.append(el("h3", "", "Preuves"));
  nodes("evidence").forEach(n => box.append(item(n.title, () => openEvidence(n.id), "n:" + n.id, ui.view?.id === n.id)));
}
function renderPuzzles(box) {
  box.append(el("h3", "", "Énigmes"));
  nodes("puzzle").forEach(z => {
    novel.delete("n:" + z.id);
    const done = st.solved.find(r => r.id === z.id), card = el("div", "puzzle" + (done ? " ok" : ""));
    card.append(el("h4", "", z.title), el("p", "", z.prompt));
    if (done) card.append(el("p", "gold", done.text));
    else if (z.kind === "game") { const b = el("button", "btn", "Jouer"); b.onclick = () => playGame(z); card.append(b); }
    else {
      const f = el("form", "row"), inp = el("input"); inp.placeholder = "Réponse";
      f.append(inp, el("button", "btn", "Essayer"));
      f.onsubmit = async e => { e.preventDefault(); if (!(await solve(z, norm(inp.value)))) { sfx("fail"); toast(["Ce n'est pas ça."]); } };
      card.append(f);
    }
    box.append(card);
  });
  setTimeout(renderNav);
}
async function solve(z, answer) {
  const r = await open(S.answers, await keyOf("puz", [z.id, answer]));
  if (!r) return false;
  sfx("solve"); burst(innerWidth / 2, innerHeight / 2, 80);
  await discover(async () => { st.solved.push({ id: z.id, text: r.text }); await applyUnlock("z:" + z.id, r.unlock); });
  return true;
}
// Rover trip to a newly detected place (game/rover.js); difficulty grows with each place reached
let stopRover = null;
function expedition(pid) {
  const d = $("minigame");
  $("mg-title").textContent = "Expédition · " + placeLabel(pid); $("mg-status").textContent = "";
  stopRover = rover($("mg-board"), { seed: pid, level: st.reached.length, label: placeLabel(pid) }, {
    status: t => { $("mg-status").textContent = t; },
    win: async () => {
      d.close(); const r = $("pane").getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 120, 70);
      const msg = `Rover arrivé · ${placeLabel(pid)}`;
      await discover(() => { add(st.reached, [pid]); st.feed = [msg, ...st.feed].slice(0, 10); }); toast([msg]);
    },
  });
  d.addEventListener("close", () => { stopRover?.(); stopRover = null; }, { once: true });
  d.showModal();
}
function playGame(z) {
  const g = PUZZLES.find(p => p.id === z.game), d = $("minigame");
  $("mg-title").textContent = z.title; $("mg-status").textContent = "";
  g.init($("mg-board"), { win: () => { $("mg-status").textContent = "Réussi !"; solve(z, "win"); }, status: t => { $("mg-status").textContent = t; } });
  d.showModal();
}
function renderNotebook(box) {
  const area = el("textarea"); area.placeholder = "Vos notes…"; area.value = st.notes;
  area.oninput = () => { st.notes = area.value; save(); };
  const q = el("input", "filter"), res = el("div");
  q.placeholder = "Chercher dans tout ce qui a été lu…";
  q.oninput = () => {
    const v = norm(q.value); res.replaceChildren();
    if (v.length < 2) return;
    const hit = (label, text, onclick) => { if (norm(text).includes(v)) res.append(item(label, onclick, null, false, " " + text.slice(0, 140))); };
    sortedScenes().forEach(s => s.lines.forEach(([sp, t], i) => hit(`${momentLabel(s.moment)} · ${who(sp) || "—"} :`, t, () => showScene(s.id, i))));
    nodes("talk").forEach(n => st.asked.filter(a => a.startsWith(n.id + "#")).forEach(a => n.topics[+a.split("#")[1]].lines.forEach(([sp, t]) => hit(`${n.title} · ${who(sp) || "—"} :`, t, () => openTalk(n.id)))));
    nodes("chapter").forEach(n => n.text.forEach(t => hit(n.title, t, () => openChapter(n.id))));
    nodes("evidence").forEach(n => n.text.forEach(t => hit(n.title, t, () => openEvidence(n.id))));
  };
  box.append(el("h3", "", "Carnet"), area, el("h4", "", "Rechercher"), q, res, el("h4", "", "Répliques épinglées"));
  st.pins.forEach((pin, k) => {
    const row = el("div", "pin");
    const goTo = item(`${who(pin.sp) ? who(pin.sp) + " : " : ""}${pin.t}`, () => openRef(pin.ref));
    const del = el("button", "chip", "✕"); del.onclick = () => { st.pins.splice(k, 1); save(); renderPane(); };
    row.append(goTo, del); box.append(row);
  });
}
function renderFinal(box) {
  const f = S.final;
  box.append(el("h3", "", "Conclusion"));
  if (st.ending) { const b = el("button", "btn", "Relire le dénouement"); b.onclick = showEnding; return box.append(el("p", "gold", "Affaire résolue ✦"), b); }
  const form = el("form", "final"), picks = [];
  f.text.split(/\{(\d+)\}/).forEach((p, i) => {
    if (i % 2 === 0) return form.append(document.createTextNode(p));
    const s = el("select"); s.append(el("option", "", "…")); s.firstChild.value = "";
    f.options[+p].forEach((o, k) => { const opt = el("option", "", o); opt.value = k; s.append(opt); });
    picks[+p] = s; form.append(s);
  });
  form.append(el("br"), el("button", "btn", "Présenter ma conclusion"));
  form.onsubmit = async e => {
    e.preventDefault();
    if (picks.some(s => s.value === "")) return toast(["Complétez chaque blanc."]);
    const end = await open(f.ending, await keyOf("fin", picks.map(s => s.value)));
    if (!end) { sfx("fail"); return toast(["Quelque chose ne colle pas encore."]); }
    st.ending = end; save(); sfx("solve"); burst(innerWidth / 2, innerHeight / 2, 120); renderNav(); renderPane(); showEnding();
  };
  box.append(el("p", "muted", "Quand vous pensez avoir compris, complétez le rapport."), form);
}
function showEnding() { ui.view = null; reader("DÉNOUEMENT", st.ending.title, paras(st.ending.lines, "prose book")); }

// ---- Save menu ----
$("export").onclick = () => {
  const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(st)], { type: "application/json" }));
  a.download = "enquete-sauvegarde.json"; a.click();
};
$("import").onchange = async e => {
  try { await load(JSON.parse(await e.target.files[0].text())); save(); renderNav(); renderPane(); toast(["Sauvegarde chargée."]); }
  catch (err) { toast(["Fichier de sauvegarde illisible."]); }
};
$("reset").onclick = async () => {
  if (!confirm("Effacer toute la progression ?")) return;
  await newGame(); ui.view = null; ui.room = null; renderNav(); renderPane(); $("reader").replaceChildren(); boot();
};

// ---- Boot: short system log and a start button; the intro becomes the mission order of the first chapter ----
const BOOT_LOG = ["liaison orbitale ........ ok", "relais Terre ............ latence 12 min", "capteurs de la colonie .. archives montées",
  "affectation ............. lieutenant de police", "ouverture de session ...."];
async function boot() {
  const log = $("boot-log"), d = $("boot"), btn = $("boot-go");
  log.replaceChildren(); $("boot-title").textContent = S.title; d.showModal();
  let skip = false; d.onclick = () => { skip = true; };
  for (const t of BOOT_LOG) {
    log.append(el("div", "", "> " + t));
    sfx("tick");
    if (!skip) await new Promise(r => setTimeout(r, 180));
  }
  btn.focus();
  await new Promise(r => d.addEventListener("close", r, { once: true }));
  st.seenIntro = true; save(); sfx("discover");
  const first = nodes("chapter")[0]; if (first) openChapter(first.id);
}

// ---- Telemetry: real Mars time (Mars Sol Date and Coordinated Mars Time) and habitat readings ----
function telemetry() {
  const msd = (Date.now() / 864e5 + 2440587.5 + 69.184 / 86400 - 2405522.0028779) / 1.0274912517;
  const h = (msd % 1) * 24, pad = x => String(Math.floor(x)).padStart(2, "0");
  const jit = (v, d) => (v + (Math.random() - .5) * d).toFixed(1);
  $("telemetry").textContent = `MSD ${Math.floor(msd)} · ${pad(h)}:${pad((h % 1) * 60)} MTC · O₂ ${jit(20.9, .2)} % · ${jit(101.3, .4)} kPa · ext. ${jit(-63, 4)} °C`;
}
telemetry(); setInterval(telemetry, 3000);

// Burger menu with the secondary tools
$("menu-btn").onclick = e => {
  e.stopPropagation(); const m = $("menu"); m.hidden = !m.hidden;
  $("menu-btn").setAttribute("aria-expanded", String(!m.hidden)); $("menu-btn").classList.toggle("open", !m.hidden); sfx("tick");
};
document.addEventListener("click", e => { if (!$("menu").hidden && !e.target.closest(".menu")) { $("menu").hidden = true; $("menu-btn").classList.remove("open"); $("menu-btn").setAttribute("aria-expanded", "false"); } });

(async () => {
  document.title = S.title; $("title").textContent = S.title;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE)); } catch (e) { /* no save */ }
  if (saved) await load(saved); else await newGame();
  renderNav(); renderPane();
  if (!st.seenIntro) boot();
  else { const last = nodes("chapter").at(-1); if (last) reader("CHAPITRE", last.title, paras(last.text, "prose book")); }
})();
