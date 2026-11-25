// Lantern engine. A scene opens only when the player names its exact moment, place and
// people: that triple is the key that decrypts it (see tools/build_story.py).

const S = window.STORY;
const $ = id => document.getElementById(id);
const enc = new TextEncoder(), dec = new TextDecoder();
const SAVE = "lantern-save-v2";

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
const fresh = () => ({ keys: [], moments: [], places: [], known: [], labels: {}, guess: {}, ok: [], puzzles: [], solved: [], notes: "", pins: [], ending: null, finalOpen: false, seenIntro: false });
let st = fresh(), scenes = {}, current = null, sel = { moment: null, place: null, people: new Set() };
// Scene list filters and items discovered during this visit (highlighted until clicked)
const flt = { moment: "", place: "", a: "", b: "" }, novel = new Set();
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
  if (u.final) st.finalOpen = true;
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
// Identity fields: options are strings or { label, group }; the first field is the name
const optLabel = (f, i) => { const o = S.fields[f].options[i]; return typeof o === "string" ? o : o.label; };
const who = p => (p === 0 ? "" : st.ok.includes(p) ? optLabel(0, st.guess[p][0]) : st.labels[p] || S.aka?.[p] || `#${p}`);
const nameEl = (tag, cls, p) => { const e = el(tag, cls, who(p)); e.dataset.p = p; return e; };
const refreshNames = () => document.querySelectorAll("[data-p]").forEach(e => { e.textContent = who(+e.dataset.p); });
// Snapshot of what is known, to announce and highlight discoveries
const snap = () => ({ p: new Set(st.known), l: new Set(allPlaces().map(x => x.id)), m: new Set(st.moments) });
function discovered(b) {
  const np = st.known.filter(p => !b.p.has(p)), nl = allPlaces().filter(x => !b.l.has(x.id)), nm = st.moments.filter(m => !b.m.has(m));
  np.forEach(p => novel.add("p" + p)); nl.forEach(x => novel.add("l" + x.id)); nm.forEach(m => novel.add("m" + m));
  const bits = [...nm.map(momentLabel), ...nl.map(x => x.label), np.length ? `${np.length} personne${np.length > 1 ? "s" : ""}` : ""].filter(Boolean);
  return bits.length ? ` Nouveau : ${bits.join(", ")}.` : "";
}
function follow(f) {
  Object.assign(flt, { moment: "", place: "", a: "", b: "" }, f);
  document.querySelector('.tabs button[data-tab="scenes"]').click(); renderList();
}
const sortedScenes = () => Object.values(scenes).sort((a, b) => momentIdx(a.moment) - momentIdx(b.moment) || allPlaces().findIndex(p => p.id === a.place) - allPlaces().findIndex(p => p.id === b.place));
function say(text, cls = "") { const m = $("msg"); m.textContent = text; m.className = "msg"; void m.offsetWidth; m.className = "msg " + cls; }

// ---- Lantern ----
function renderLantern() {
  const chips = (box, kind, items, isOn, onClick) => box.replaceChildren(...items.map(([id, label]) => {
    const b = kind === "p" ? nameEl("button", "chip", id) : el("button", "chip", label);
    if (isOn(id)) b.classList.add("on");
    if (novel.has(kind + id)) b.classList.add("new");
    b.onclick = () => { novel.delete(kind + id); sfx("tick"); onClick(id); };
    return b;
  }));
  chips($("moments"), "m", S.moments.filter(m => !m.locked || st.moments.includes(m.id)).map(m => [m.id, m.label]), id => sel.moment === id, id => { sel.moment = sel.moment === id ? null : id; renderLantern(); });
  chips($("places"), "l", allPlaces().map(p => [p.id, p.label]), id => sel.place === id, id => { sel.place = sel.place === id ? null : id; renderLantern(); });
  chips($("people"), "p", st.known.slice().sort((a, b) => a - b).map(p => [p]), p => sel.people.has(p),
    p => { sel.people.has(p) ? sel.people.delete(p) : sel.people.add(p); renderLantern(); });
  filterPeople();
  $("people-count").textContent = sel.people.size ? `(${sel.people.size})` : "";
}
// Hide people chips not matching the filter (selected ones always stay visible)
function filterPeople() {
  const q = norm($("people-filter").value);
  $("people").querySelectorAll(".chip").forEach(b => { b.hidden = q && !b.classList.contains("on") && !norm(`${b.dataset.p} ${b.textContent}`).includes(q); });
}
$("people-filter").oninput = filterPeople;
$("people-clear").onclick = () => { sel.people.clear(); renderLantern(); };

async function light() {
  if (!sel.moment || !sel.place) return say("Choisissez un moment et un lieu.");
  const people = [...sel.people].sort((a, b) => a - b);
  const before = snap(), had = Object.keys(scenes).length;
  const s = await unlockScene(await keyOf("scene", [sel.moment, sel.place, people.join(",")]));
  if (s) {
    const lamp = $("light"); lamp.classList.remove("lit"); void lamp.offsetWidth; lamp.classList.add("lit");
    const r = lamp.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 60);
    sfx("light"); if (novel.size) setTimeout(() => sfx("discover"), 700);
    say((Object.keys(scenes).length > had ? "La lanterne s'illumine." : "Scène déjà connue.") + discovered(before), "good");
    save(); renderAll(); return show(s.id);
  }
  const n = S.hints[hex(await sha(`hint|${sel.moment}|${sel.place}`)).slice(0, 16)];
  sfx(n !== undefined ? "hint" : "miss");
  if (n !== undefined) say(`La flamme vacille : une scène existe ici, avec ${n} personne${n > 1 ? "s" : ""}.`, "warn");
  else say("La lanterne reste éteinte : rien ne s'est passé ici à ce moment.");
}

// ---- Scene viewer ----
function show(id, line = -1) {
  current = id;
  const s = scenes[id], v = $("scene");
  v.replaceChildren();
  const head = el("div", "scene-head");
  // Moment, place and people link to the scene list filtered on them
  const link = (text, f, p) => { const b = p ? nameEl("button", "link", p) : el("button", "link", text); b.title = "Voir les scènes liées"; b.onclick = () => follow(f); return b; };
  const where = el("div", "mono gold");
  where.append(link(momentLabel(s.moment), { moment: s.moment }), " · ", link(placeLabel(s.place), { place: s.place }));
  head.append(where, el("h2", "", s.title || ""));
  const present = el("div", "present", "Présents : ");
  s.people.forEach((p, k) => { if (k) present.append(", "); present.append(link("", { a: String(p) }, p)); });
  head.append(present);
  v.append(head);
  s.lines.forEach(([sp, text], i) => {
    const p = el("p", sp === 0 ? "line narr" : "line");
    p.style.animationDelay = `${Math.min(i, 20) * 40}ms`;
    if (sp) p.append(nameEl("span", "who", sp));
    p.append(document.createTextNode(text));
    if (i === line) p.classList.add("hit");
    p.title = "Épingler dans le carnet";
    p.onclick = () => { const pin = { id, i }; if (!st.pins.some(q => q.id === id && q.i === i)) { st.pins.push(pin); save(); renderNotebook(); sfx("pin"); say("Réplique épinglée.", "good"); } };
    v.append(p);
  });
  if (line >= 0) v.querySelector(".hit")?.scrollIntoView({ block: "center" });
  else v.scrollTop = 0;
  renderList();
}

// ---- Side panels ----
function renderList() {
  const box = $("tab-scenes"), all = sortedScenes();
  const pick = (key, label, items) => {
    const s = el("select"); s.append(el("option", "", label)); s.firstChild.value = "";
    items.forEach(([v, t]) => { const o = el("option", "", t); o.value = v; s.append(o); });
    s.value = flt[key]; if (s.value !== flt[key]) flt[key] = "";
    s.onchange = () => { flt[key] = s.value; renderList(); };
    return s;
  };
  const people = st.known.slice().sort((a, b) => a - b).map(p => [String(p), `${who(p)}${who(p) === `#${p}` ? "" : ` (#${p})`}`]);
  const bar = el("div", "filters");
  bar.append(pick("moment", "Tous les moments", S.moments.filter(m => all.some(s => s.moment === m.id)).map(m => [m.id, m.label])),
    pick("place", "Tous les lieux", allPlaces().filter(p => all.some(s => s.place === p.id)).map(p => [p.id, p.label])),
    pick("a", "Avec n'importe qui", people), pick("b", "… et aussi avec", people));
  const list = all.filter(s => (!flt.moment || s.moment === flt.moment) && (!flt.place || s.place === flt.place)
    && (!flt.a || s.people.includes(+flt.a)) && (!flt.b || s.people.includes(+flt.b)));
  const count = el("p", "muted", `${Object.keys(scenes).length} / ${Object.keys(S.scenes).length} scènes trouvées`);
  if (Object.values(flt).some(Boolean)) {
    const clear = el("button", "link", "effacer les filtres"); clear.onclick = () => follow({});
    count.append(` · ${list.length} affichée${list.length > 1 ? "s" : ""} · `, clear);
  }
  box.replaceChildren(bar, count);
  // Chronological list grouped by moment
  let last = null;
  list.forEach(s => {
    if (s.moment !== last) { box.append(el("h4", "", momentLabel(s.moment))); last = s.moment; }
    const b = el("button", "item" + (s.id === current ? " on" : ""));
    b.append(el("span", "", `${placeLabel(s.place)}${s.lead ? " ✦" : ""}`), el("span", "muted", ` · ${s.title || ""}`));
    b.title = s.people.map(who).join(", ");
    b.onclick = () => show(s.id);
    box.append(b);
  });
}

function renderPeople() {
  const box = $("tab-people"), need = Math.min(3, S.people - st.ok.length);
  const fieldNames = S.fields.map(f => f.label.toLowerCase()).join(" + ");
  const q = el("input"); q.placeholder = "Filtrer (numéro, surnom, nom)…";
  const list = el("div");
  box.replaceChildren(el("p", "muted", `Renommez chacun à votre guise, puis proposez ${fieldNames}. Les fiches justes se confirment par ${need || 3} à la fois. Identifiés : ${st.ok.length} / ${S.people}.`), q, list);
  st.known.slice().sort((a, b) => a - b).forEach(p => {
    const done = st.ok.includes(p), row = el("div", "person" + (done ? " ok" : ""));
    const g = st.guess[p] || (st.guess[p] = []);
    const label = el("input"); label.placeholder = S.aka?.[p] || "surnom"; label.value = st.labels[p] || "";
    label.oninput = () => { st.labels[p] = label.value.trim(); save(); refreshNames(); };
    label.onchange = () => renderList();
    const go = el("button", "chip", "scènes"); go.title = "Voir ses scènes"; go.onclick = () => follow({ a: String(p) });
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
      s.onchange = () => { g[k] = s.value === "" ? undefined : +s.value; save(); };
      fields.append(s);
    });
    row.append(el("span", "mono red", `#${p}`), label, go, fields);
    row.dataset.q = norm(`${p} ${who(p)} ${S.aka?.[p] || ""}`);
    list.append(row);
  });
  q.oninput = () => { const n = norm(q.value); list.querySelectorAll(".person").forEach(r => { r.hidden = n && !r.dataset.q.includes(n); }); };
  const check = el("button", "btn", "Vérifier les fiches");
  check.onclick = async () => {
    const good = [];
    for (const p of st.known) {
      const g = st.guess[p];
      if (st.ok.includes(p) || !g || S.fields.some((_, k) => g[k] === undefined || g[k] === null)) continue;
      if (S.who.includes(hex(await sha(`who|${p}|${g.slice(0, S.fields.length).join("|")}`)).slice(0, 16))) good.push(p);
    }
    if (need && good.length >= need) {
      st.ok.push(...good); sfx("confirm"); const r = check.getBoundingClientRect(); burst(r.left + r.width / 2, r.top, 50); save(); renderAll(); if (current) show(current);
      say(`${good.length} fiche${good.length > 1 ? "s" : ""} confirmée${good.length > 1 ? "s" : ""} !`, "good");
      box.querySelectorAll(".person.ok").forEach(r => { if (good.includes(+r.querySelector(".red").textContent.slice(1))) r.classList.add("flash"); });
    } else sfx("fail"), say(`Pas encore : il faut au moins ${need} fiche${need > 1 ? "s" : ""} entièrement juste${need > 1 ? "s" : ""} (non confirmées) en même temps.`, "warn");
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
  const before = snap(); sfx("solve"); burst(innerWidth / 2, innerHeight / 2, 80);
  st.solved.push({ id: z.id, ...r }); applyUnlock(r.unlock); save(); renderAll(); say("Énigme résolue !" + discovered(before), "good"); renderLantern(); return true;
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

// Tabs appear once useful: puzzles after the first one is found, the ending once the story opens it
function renderTabs() {
  const show = { puzzles: st.puzzles.length > 0, final: st.finalOpen || !!st.ending };
  for (const [t, on] of Object.entries(show)) {
    $("tab-btn-" + t).hidden = !on;
    if (!on && $("tab-" + t).classList.contains("on")) document.querySelector('.tabs button[data-tab="scenes"]').click();
  }
}

function renderAll() { renderTabs(); renderLantern(); renderList(); renderPeople(); renderNotebook(); renderPuzzles(); renderFinal(); }

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
