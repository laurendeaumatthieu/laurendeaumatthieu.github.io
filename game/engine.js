// Lantern engine. A scene opens only when the player names its exact moment, place and
// people: that triple is the key that decrypts it (see tools/build_story.py).

const S = window.STORY;
const $ = id => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const SAVE = "lantern-save-v1";

// ---- Crypto (must match tools/build_story.py) ----
const sha = async bytes => new Uint8Array(await crypto.subtle.digest("SHA-256", typeof bytes === "string" ? enc.encode(bytes) : bytes));
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
const fresh = () => ({ keys: [], moments: [], places: [], known: [], labels: {}, guess: {}, ok: [], puzzles: [], solved: [], notes: "", pins: [], ending: null, seenIntro: false });
let st = fresh(), scenes = {}, current = null, sel = { moment: null, place: null, people: new Set() };
function save() { try { localStorage.setItem(SAVE, JSON.stringify(st)); } catch (e) { /* storage unavailable */ } }

async function unlockScene(k, quiet = false) {
  const s = await open(S.scenes, k);
  if (!s) return null;
  if (!st.keys.includes(hex(k))) st.keys.push(hex(k));
  scenes[s.id] = s;
  s.people.forEach(p => { if (!st.known.includes(p)) st.known.push(p); });
  applyUnlock(s.unlock, quiet);
  return s;
}
// Unlocks carry places, puzzles, moments (ids), people (numbers) and an optional message
function applyUnlock(u = {}, quiet = false) {
  (u.moments || []).forEach(m => { if (!st.moments.includes(m)) st.moments.push(m); });
  (u.people || []).forEach(p => { if (!st.known.includes(p)) st.known.push(p); });
  if (u.message && !quiet) { $("notice-text").replaceChildren(...[].concat(u.message).map(t => el("p", "", t))); $("notice").showModal(); }
  (u.places || []).forEach(p => { if (!st.places.some(q => q.id === p.id)) st.places.push(p); });
  (u.puzzles || []).forEach(p => { if (!st.puzzles.some(q => q.id === p.id)) st.puzzles.push(p); });
}
async function load(data) {
  st = Object.assign(fresh(), data); scenes = {};
  for (const h of st.keys) await unlockScene(unhex(h), true);
  for (const r of st.solved) applyUnlock(r.unlock, true);
}

// ---- Helpers (el and rand come from assets/puzzles.js) ----
const momentIdx = id => S.moments.findIndex(m => m.id === id);
const momentLabel = id => S.moments.find(m => m.id === id)?.label ?? id;
const allPlaces = () => [...S.places, ...st.places];
const placeLabel = id => allPlaces().find(p => p.id === id)?.label ?? id;
const who = p => (p === 0 ? "" : st.ok.includes(p) ? S.cast[st.guess[p]].name : st.labels[p] || `#${p}`);
const sortedScenes = () => Object.values(scenes).sort((a, b) => momentIdx(a.moment) - momentIdx(b.moment) || allPlaces().findIndex(p => p.id === a.place) - allPlaces().findIndex(p => p.id === b.place));
function say(text, cls = "") { const m = $("msg"); m.textContent = text; m.className = "msg " + cls; }

// ---- Lantern ----
function renderLantern() {
  const chips = (box, items, isOn, onClick) => box.replaceChildren(...items.map(([id, label]) => {
    const b = el("button", "chip" + (isOn(id) ? " on" : ""), label); b.onclick = () => onClick(id); return b;
  }));
  chips($("moments"), S.moments.filter(m => !m.locked || st.moments.includes(m.id)).map(m => [m.id, m.label]), id => sel.moment === id, id => { sel.moment = sel.moment === id ? null : id; renderLantern(); });
  chips($("places"), allPlaces().map(p => [p.id, p.label]), id => sel.place === id, id => { sel.place = sel.place === id ? null : id; renderLantern(); });
  chips($("people"), st.known.slice().sort((a, b) => a - b).map(p => [p, who(p)]), p => sel.people.has(p),
    p => { sel.people.has(p) ? sel.people.delete(p) : sel.people.add(p); renderLantern(); });
}

async function light() {
  if (!sel.moment || !sel.place) return say("Choisissez un moment et un lieu.");
  const people = [...sel.people].sort((a, b) => a - b);
  const s = await unlockScene(await keyOf("scene", [sel.moment, sel.place, people.join(",")]));
  if (s) { say("La lanterne s'illumine.", "good"); save(); renderAll(); return show(s.id); }
  const n = S.hints[hex(await sha(`hint|${sel.moment}|${sel.place}`)).slice(0, 16)];
  if (n !== undefined) say(`La flamme vacille : une scène existe ici, avec ${n} personne${n > 1 ? "s" : ""}.`, "warn");
  else say("La lanterne reste éteinte : rien ne s'est passé ici à ce moment.");
}

// ---- Scene viewer ----
function show(id, line = -1) {
  current = id;
  const s = scenes[id], v = $("scene");
  v.replaceChildren();
  const head = el("div", "scene-head");
  head.append(el("div", "mono gold", `${momentLabel(s.moment)} · ${placeLabel(s.place)}`), el("h2", "", s.title || ""));
  head.append(el("div", "present", "Présents : " + s.people.map(who).join(", ")));
  v.append(head);
  s.lines.forEach(([sp, text], i) => {
    const p = el("p", sp === 0 ? "line narr" : "line");
    if (sp) p.append(el("span", "who", who(sp)));
    p.append(document.createTextNode(text));
    if (i === line) p.classList.add("hit");
    p.title = "Épingler dans le carnet";
    p.onclick = () => { const pin = { id, i }; if (!st.pins.some(q => q.id === id && q.i === i)) { st.pins.push(pin); save(); renderNotebook(); say("Réplique épinglée.", "good"); } };
    v.append(p);
  });
  if (line >= 0) v.querySelector(".hit")?.scrollIntoView({ block: "center" });
  else v.scrollTop = 0;
  renderList();
}

// ---- Side panels ----
function renderList() {
  const box = $("tab-scenes");
  box.replaceChildren(el("p", "muted", `${Object.keys(scenes).length} / ${Object.keys(S.scenes).length} scènes`));
  sortedScenes().forEach(s => {
    const b = el("button", "item" + (s.id === current ? " on" : ""));
    b.append(el("span", "mono gold", momentLabel(s.moment)), el("span", "", ` ${placeLabel(s.place)}${s.lead ? " ✦" : ""}`));
    b.onclick = () => show(s.id);
    box.append(b);
  });
}

function renderPeople() {
  const box = $("tab-people");
  box.replaceChildren(el("p", "muted", "Donnez un surnom à chacun, puis proposez une identité. Les identités se confirment par trois."));
  st.known.slice().sort((a, b) => a - b).forEach(p => {
    const row = el("div", "person" + (st.ok.includes(p) ? " ok" : ""));
    row.append(el("span", "mono red", `#${p}`));
    const label = el("input"); label.placeholder = "surnom"; label.value = st.labels[p] || "";
    label.onchange = () => { st.labels[p] = label.value.trim(); save(); renderLantern(); if (current) show(current); };
    const pick = el("select"); pick.append(el("option", "", "— identité —"));
    S.cast.forEach((c, i) => { const o = el("option", "", `${c.name}${c.role ? ", " + c.role : ""}`); o.value = i; pick.append(o); });
    pick.value = st.guess[p] ?? ""; pick.disabled = st.ok.includes(p);
    pick.onchange = () => { if (pick.value === "") delete st.guess[p]; else st.guess[p] = +pick.value; save(); };
    row.append(label, pick); box.append(row);
  });
  const check = el("button", "btn", "Vérifier les identités");
  check.onclick = async () => {
    const good = [];
    for (const [p, c] of Object.entries(st.guess)) if (!st.ok.includes(+p) && S.who.includes(hex(await sha(`who|${p}|${c}`)).slice(0, 16))) good.push(+p);
    if (good.length >= 3) { st.ok.push(...good); save(); say(`${good.length} identités confirmées !`, "good"); renderAll(); if (current) show(current); }
    else say("Pas encore : il faut au moins trois identités justes (non confirmées) en même temps.", "warn");
  };
  box.append(check);
}

function renderNotebook() {
  const box = $("tab-notes");
  const area = el("textarea"); area.placeholder = "Vos notes…"; area.value = st.notes;
  area.oninput = () => { st.notes = area.value; save(); };
  box.replaceChildren(area, el("h4", "", "Répliques épinglées"));
  st.pins.forEach((pin, k) => {
    const s = scenes[pin.id]; if (!s) return;
    const [sp, text] = s.lines[pin.i];
    const row = el("div", "pin");
    const go = el("button", "item", `${who(sp) ? who(sp) + " : " : ""}${text}`); go.onclick = () => show(pin.id, pin.i);
    const del = el("button", "chip", "✕"); del.onclick = () => { st.pins.splice(k, 1); save(); renderNotebook(); };
    row.append(go, del); box.append(row);
  });
}

function renderSearch() {
  const box = $("tab-search"), q = el("input"), res = el("div");
  q.placeholder = "Chercher dans les scènes…";
  q.oninput = () => {
    const n = norm(q.value); res.replaceChildren();
    if (n.length < 2) return;
    sortedScenes().forEach(s => s.lines.forEach(([sp, text], i) => {
      if (!norm(text).includes(n) && !norm(who(sp)).includes(n)) return;
      const b = el("button", "item"); b.append(el("span", "mono gold", momentLabel(s.moment) + " "), document.createTextNode(`${who(sp) ? who(sp) + " : " : ""}${text}`));
      b.onclick = () => show(s.id, i); res.append(b);
    }));
  };
  box.replaceChildren(q, res);
}

function renderPuzzles() {
  const box = $("tab-puzzles");
  box.replaceChildren(st.puzzles.length ? "" : el("p", "muted", "Aucune énigme pour l'instant."));
  st.puzzles.forEach(z => {
    const done = st.solved.some(r => r.id === z.id), card = el("div", "puzzle" + (done ? " ok" : ""));
    card.append(el("h4", "", z.title), el("p", "", z.prompt));
    if (done) card.append(el("p", "gold", st.solved.find(r => r.id === z.id).text));
    else if (z.type === "game") { const b = el("button", "btn", "Jouer"); b.onclick = () => playGame(z); card.append(b); }
    else {
      const f = el("form", "row"), inp = el("input"); inp.placeholder = "Réponse";
      f.append(inp, el("button", "btn", "Essayer"));
      f.onsubmit = async e => { e.preventDefault(); if (!(await solve(z, norm(inp.value)))) say("Ce n'est pas ça.", "warn"); };
      card.append(f);
    }
    box.append(card);
  });
}
async function solve(z, answer) {
  const r = await open(S.answers, await keyOf("puz", [z.id, answer]));
  if (!r) return false;
  st.solved.push({ id: z.id, ...r }); applyUnlock(r.unlock); save(); renderAll(); say("Énigme résolue !", "good"); return true;
}
function playGame(z) {
  const g = PUZZLES.find(p => p.id === z.game), d = $("minigame");
  $("mg-title").textContent = z.title; $("mg-status").textContent = "";
  g.init($("mg-board"), { win: () => { $("mg-status").textContent = "Réussi !"; solve(z, "win"); }, status: t => { $("mg-status").textContent = t; } });
  d.showModal();
}

function renderFinal() {
  const box = $("tab-final"), f = S.final;
  if (st.ending) return box.replaceChildren(el("p", "gold", "Mystère résolu ✦"), (() => { const b = el("button", "btn", "Relire le dénouement"); b.onclick = () => showEnding(); return b; })());
  const form = el("form", "final"), parts = f.text.split(/\{(\d+)\}/), picks = [];
  parts.forEach((p, i) => {
    if (i % 2 === 0) return form.append(document.createTextNode(p));
    const s = el("select"); s.append(el("option", "", "…"));
    f.options[+p].forEach((o, k) => { const opt = el("option", "", o); opt.value = k; s.append(opt); });
    picks[+p] = s; form.append(s);
  });
  form.append(el("br"), el("button", "btn", "Proposer ma solution"));
  form.onsubmit = async e => {
    e.preventDefault();
    if (picks.some(s => s.value === "")) return say("Complétez chaque blanc.", "warn");
    const end = await open(f.ending, await keyOf("fin", picks.map(s => s.value)));
    if (!end) return say("La lanterne doute… quelque chose ne colle pas.", "warn");
    st.ending = end; save(); renderAll(); showEnding(); say("Mystère résolu !", "good");
  };
  box.replaceChildren(el("p", "muted", "Quand vous pensez avoir compris, complétez le récit."), form);
}
function showEnding() {
  current = null;
  const v = $("scene"), e = st.ending;
  v.replaceChildren(el("h2", "gold", e.title));
  e.lines.forEach(t => v.append(el("p", "line narr", t)));
}

function renderAll() { renderLantern(); renderList(); renderPeople(); renderNotebook(); renderPuzzles(); renderFinal(); }

// ---- Save menu ----
$("export").onclick = () => {
  const a = el("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(st)], { type: "application/json" }));
  a.download = "lanterne-sauvegarde.json"; a.click();
};
$("import").onchange = async e => {
  try { await load(JSON.parse(await e.target.files[0].text())); save(); renderAll(); say("Sauvegarde chargée.", "good"); }
  catch (err) { say("Fichier de sauvegarde illisible.", "warn"); }
};
$("reset").onclick = async () => {
  if (!confirm("Effacer toute la progression ?")) return;
  await load(fresh()); await newGame(); renderAll(); $("scene").replaceChildren(); say("Nouvelle partie.");
};

// ---- Tabs, intro, start ----
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button, .tab").forEach(x => x.classList.remove("on"));
  b.classList.add("on"); $("tab-" + b.dataset.tab).classList.add("on");
});
$("light").onclick = light;

async function newGame() { for (const h of S.start) await unlockScene(unhex(h), true); save(); }

(async () => {
  document.title = S.title; $("title").textContent = S.title;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE)); } catch (e) { /* no save */ }
  if (saved) await load(saved); else await newGame();
  renderAll(); renderSearch();
  const first = sortedScenes()[0]; if (first) show(first.id);
  if (!st.seenIntro) {
    $("intro-text").replaceChildren(...S.intro.map(p => el("p", "", p)));
    $("intro").showModal();
    $("intro").addEventListener("close", () => { st.seenIntro = true; save(); }, { once: true });
  }
})();
