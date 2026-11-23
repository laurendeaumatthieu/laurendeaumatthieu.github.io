// Seven original puzzles. Each entry: init(root, ctx) renders a fresh game into root;
// ctx.win() reports a solved game, ctx.status(text) updates the status line.
// init may return { key(event) } to receive keyboard input while the modal is open.

const rand = n => Math.floor(Math.random() * n);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// ---- Make 24 (exact rational arithmetic) ----
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
const OPS = {
  "+": (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d),
  "−": (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d),
  "×": (a, b) => frac(a.n * b.n, a.d * b.d),
  "÷": (a, b) => (b.n === 0 ? null : frac(a.n * b.d, a.d * b.n)),
};
function solvable24(vals) {
  if (vals.length === 1) return vals[0].n === 24 && vals[0].d === 1;
  for (let i = 0; i < vals.length; i++)
    for (let j = 0; j < vals.length; j++) {
      if (i === j) continue;
      const rest = vals.filter((_, k) => k !== i && k !== j);
      for (const op of Object.values(OPS)) {
        const r = op(vals[i], vals[j]);
        if (r && solvable24([...rest, r])) return true;
      }
    }
  return false;
}

function make24(root, ctx) {
  let nums;
  do nums = Array.from({ length: 4 }, () => frac(1 + rand(9))); while (!solvable24(nums));
  let vals = nums.slice(), history = [], sel = null, op = null, over = false;
  const show = v => (v.d === 1 ? String(v.n) : `${v.n}/${v.d}`);

  function render() {
    root.replaceChildren();
    const grid = el("div", "nums");
    vals.forEach((v, i) => {
      const b = el("button", "num" + (v ? "" : " gone") + (sel === i ? " sel" : ""), v ? show(v) : "");
      b.onclick = () => pick(i);
      grid.append(b);
    });
    const ops = el("div", "ops");
    Object.keys(OPS).forEach(o => {
      const b = el("button", "chip" + (op === o ? " sel" : ""), o);
      b.onclick = () => { if (sel !== null) { op = o; render(); } };
      ops.append(b);
    });
    const undo = el("button", "chip", "↶");
    undo.title = t("p24.undo");
    undo.onclick = () => { if (history.length && !over) { vals = history.pop(); sel = op = null; render(); } };
    ops.append(undo);
    root.append(grid, ops);
  }

  function pick(i) {
    if (over || !vals[i]) return;
    if (sel === null || sel === i) { sel = sel === i ? null : i; op = null; return render(); }
    if (!op) { sel = i; return render(); }
    const r = OPS[op](vals[sel], vals[i]);
    if (!r) return;
    history.push(vals.slice());
    vals[i] = r; vals[sel] = null; sel = i; op = null;
    const left = vals.filter(Boolean);
    if (left.length === 1 && left[0].n === 24 && left[0].d === 1) { over = true; ctx.win(); }
    render();
  }
  render();
}

// ---- Sliding tiles (3x3) ----
function slide(root, ctx) {
  const N = 3, solved = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  let s = solved.slice(), moves = 0, over = false;
  const nbrs = i => [i - N, i + N, i % N ? i - 1 : -1, i % N < N - 1 ? i + 1 : -1].filter(j => j >= 0 && j < N * N);
  do for (let k = 0; k < 300; k++) { const e = s.indexOf(0), m = nbrs(e)[rand(nbrs(e).length)]; [s[e], s[m]] = [s[m], s[e]]; }
  while (s.join() === solved.join());

  function render() {
    root.replaceChildren();
    const b = el("div", "board");
    b.style.gridTemplateColumns = `repeat(${N}, 1fr)`; b.style.maxWidth = "300px";
    s.forEach((v, i) => {
      const c = el("div", v ? "cell tile" + (v === i + 1 ? " home" : "") : "cell empty", v || "");
      c.onclick = () => {
        const e = s.indexOf(0);
        if (over || !nbrs(e).includes(i)) return;
        [s[e], s[i]] = [s[i], s[e]]; moves++;
        ctx.status(`${t("game.moves")}: ${moves}`);
        if (s.join() === solved.join()) { over = true; ctx.win(); }
        render();
      };
      b.append(c);
    });
    root.append(b);
  }
  render();
}

// ---- Nonogram (5x5) ----
function nonogram(root, ctx) {
  const N = 5;
  let pic;
  do pic = Array.from({ length: N * N }, () => Math.random() < 0.55); while (pic.filter(Boolean).length < 8);
  const runs = line => { const r = []; let c = 0; line.forEach(f => { if (f) c++; else if (c) { r.push(c); c = 0; } }); if (c) r.push(c); return r.length ? r : [0]; };
  const row = (a, i) => a.slice(i * N, i * N + N), col = (a, j) => a.filter((_, k) => k % N === j);
  const rowClues = [...Array(N)].map((_, i) => runs(row(pic, i)));
  const colClues = [...Array(N)].map((_, j) => runs(col(pic, j)));
  const st = Array(N * N).fill(0); // 0 empty, 1 filled, 2 crossed
  let over = false;

  const b = el("div", "nono");
  b.style.gridTemplateColumns = `auto repeat(${N}, 44px)`;
  b.append(el("div"));
  colClues.forEach(c => { const d = el("div", "clue col"); c.forEach(n => d.append(el("span", "", n))); b.append(d); });
  const cells = [];
  for (let i = 0; i < N; i++) {
    const d = el("div", "clue"); rowClues[i].forEach(n => d.append(el("span", "", n))); b.append(d);
    for (let j = 0; j < N; j++) {
      const k = i * N + j, c = el("div", "cell");
      c.onclick = () => {
        if (over) return;
        st[k] = (st[k] + 1) % 3;
        c.className = "cell" + (st[k] === 1 ? " filled" : st[k] === 2 ? " cross" : "");
        c.textContent = st[k] === 2 ? "✕" : "";
        const f = st.map(v => v === 1), same = (a, b) => a.join() === b.join();
        if ([...Array(N)].every((_, x) => same(runs(row(f, x)), rowClues[x]) && same(runs(col(f, x)), colClues[x]))) { over = true; ctx.win(); }
      };
      cells.push(c); b.append(c);
    }
  }
  root.replaceChildren(b);
}

// ---- Lights (5x5) ----
function lights(root, ctx) {
  const N = 5, on = Array(N * N).fill(false);
  let over = false;
  const press = k => {
    const i = Math.floor(k / N), j = k % N;
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
      const a = i + di, b = j + dj;
      if (a >= 0 && a < N && b >= 0 && b < N) on[a * N + b] = !on[a * N + b];
    });
  };
  do for (let r = 0; r < 10; r++) press(rand(N * N)); while (!on.some(Boolean));

  const b = el("div", "board");
  b.style.gridTemplateColumns = `repeat(${N}, 1fr)`; b.style.maxWidth = "320px";
  const cells = on.map((_, k) => {
    const c = el("div", "cell");
    c.onclick = () => {
      if (over) return;
      press(k); paint();
      if (!on.some(Boolean)) { over = true; ctx.win(); }
    };
    b.append(c); return c;
  });
  const paint = () => cells.forEach((c, k) => c.classList.toggle("lit", on[k]));
  paint();
  root.replaceChildren(b);
}

// ---- Crates (box pushing, hand-made levels) ----
// # wall, . target, $ crate, @ player, * crate on target
const LEVELS = [
  ["#######", "#     #", "# .$@ #", "#     #", "#######"],
  [" ##### ", "##   # ", "# $ .##", "# @$ .#", "##    #", " ######"],
  ["########", "#  .   #", "# $##$ #", "#  @  .#", "########"],
  ["  ####  ", "###  ###", "#  $   #", "# .@*. #", "#   $  #", "###  ###", "  ####  "],
];
let pushLevel = 0, pushSolved = false;

function crates(root, ctx) {
  if (pushSolved) pushLevel = (pushLevel + 1) % LEVELS.length;
  pushSolved = false;
  const map = LEVELS[pushLevel], H = map.length, W = Math.max(...map.map(r => r.length));
  const wall = new Set(), goal = new Set(), box = new Set();
  let me, moves = 0;
  map.forEach((r, i) => [...r].forEach((ch, j) => {
    const k = i * W + j;
    if (ch === "#") wall.add(k);
    if (".*".includes(ch)) goal.add(k);
    if ("$*".includes(ch)) box.add(k);
    if (ch === "@") me = k;
  }));
  // Floor = every non-wall cell reachable from the player
  const floor = new Set([me]), todo = [me];
  while (todo.length) {
    const k = todo.pop();
    [k - W, k + W, k - 1, k + 1].forEach(n => { if (n >= 0 && n < H * W && !wall.has(n) && !floor.has(n)) { floor.add(n); todo.push(n); } });
  }
  const status = () => ctx.status(`${t("push.level")} ${pushLevel + 1}/${LEVELS.length} · ${t("game.moves")}: ${moves}`);

  function move(di, dj) {
    if (pushSolved) return;
    const step = di * W + dj, n = me + step;
    if (wall.has(n)) return;
    if (box.has(n)) {
      if (wall.has(n + step) || box.has(n + step)) return;
      box.delete(n); box.add(n + step);
    }
    me = n; moves++; status(); render();
    if ([...box].every(k => goal.has(k))) { pushSolved = true; ctx.win(); }
  }

  const b = el("div", "board sokoban");
  b.style.gridTemplateColumns = `repeat(${W}, 1fr)`; b.style.maxWidth = `${W * 46}px`;
  const cells = [...Array(H * W)].map(() => b.appendChild(el("div", "cell")));
  function render() {
    cells.forEach((c, k) => {
      c.className = "cell" + (wall.has(k) ? " wall" : floor.has(k) ? "" : " empty") +
        (goal.has(k) ? " goal" : "") + (box.has(k) ? " box" : "") + (k === me ? " me" : "");
    });
  }

  let touch = null;
  b.addEventListener("touchstart", e => { touch = e.touches[0]; }, { passive: true });
  b.addEventListener("touchend", e => {
    if (!touch) return;
    const dx = e.changedTouches[0].clientX - touch.clientX, dy = e.changedTouches[0].clientY - touch.clientY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) Math.abs(dx) > Math.abs(dy) ? move(0, Math.sign(dx)) : move(Math.sign(dy), 0);
    touch = null;
  });

  const pad = el("div", "pad");
  [["", 0, 0], ["↑", -1, 0], ["", 0, 0], ["←", 0, -1], ["↓", 1, 0], ["→", 0, 1]].forEach(([s, di, dj]) => {
    const p = s ? el("button", "chip", s) : el("span");
    if (s) p.onclick = () => move(di, dj);
    pad.append(p);
  });
  root.replaceChildren(b, pad);
  render(); status();

  const KEYS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  return { key(e) { if (KEYS[e.key]) { e.preventDefault(); move(...KEYS[e.key]); } } };
}

// ---- Circuit (rotate pipes of a random spanning tree) ----
function circuit(root, ctx) {
  const N = 5, UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
  const DIRS = [[UP, -1, 0, DOWN], [RIGHT, 0, 1, LEFT], [DOWN, 1, 0, UP], [LEFT, 0, -1, RIGHT]];
  const mask = Array(N * N).fill(0), seen = new Set([0]), stack = [0];
  while (stack.length) {
    const k = stack[stack.length - 1], i = Math.floor(k / N), j = k % N;
    const free = DIRS.filter(([, di, dj]) => { const a = i + di, b = j + dj; return a >= 0 && a < N && b >= 0 && b < N && !seen.has(a * N + b); });
    if (!free.length) { stack.pop(); continue; }
    const [bit, di, dj, back] = free[rand(free.length)], n = (i + di) * N + j + dj;
    mask[k] |= bit; mask[n] |= back; seen.add(n); stack.push(n);
  }
  const rot = m => ((m << 1) | (m >> 3)) & 15;
  const cur = mask.slice();
  const okAt = k => {
    const i = Math.floor(k / N), j = k % N;
    return DIRS.every(([bit, di, dj, back]) => {
      if (!(cur[k] & bit)) return true;
      const a = i + di, b = j + dj;
      return a >= 0 && a < N && b >= 0 && b < N && (cur[a * N + b] & back);
    });
  };
  do cur.forEach((m, k) => { let r = rand(4), v = mask[k]; while (r--) v = rot(v); cur[k] = v; }); while (cur.every((_, k) => okAt(k)));

  let over = false;
  const b = el("div", "board");
  b.style.gridTemplateColumns = `repeat(${N}, 1fr)`; b.style.maxWidth = "320px";
  const ENDS = { [UP]: "50,0", [RIGHT]: "100,50", [DOWN]: "50,100", [LEFT]: "0,50" };
  const cells = cur.map((_, k) => {
    const c = el("div", "cell pipe");
    c.onclick = () => {
      if (over) return;
      cur[k] = rot(cur[k]); paint();
      if (cur.every((_, x) => okAt(x))) { over = true; b.classList.add("done"); ctx.win(); }
    };
    b.append(c); return c;
  });
  function paint() {
    cells.forEach((c, k) => {
      const lines = Object.entries(ENDS).filter(([bit]) => cur[k] & bit)
        .map(([, p]) => { const [x, y] = p.split(","); return `<line x1="50" y1="50" x2="${x}" y2="${y}"/>`; }).join("");
      c.innerHTML = `<svg viewBox="0 0 100 100">${lines}</svg>`;
      c.classList.toggle("ok", okAt(k));
    });
  }
  paint();
  root.replaceChildren(b);
}

// ---- Dominoes: 24 tiles of a double-six set to lay along a winding chain ----
const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}) => { const e = document.createElementNS(SVG, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const PIPS = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const drawPips = (g, v, cx, cy) => PIPS[v].forEach(([dx, dy]) => g.append(svg("circle", { cx: cx + dx * 2.6, cy: cy + dy * 2.6, r: 0.95, class: "pip" })));

function dominoes(root, ctx) {
  const COUNT = 24, W = 8, H = 8, L = COUNT * 2;
  // Chain values: 25 consecutive vertices of a random Eulerian circuit of the double-six set (K7 with loops),
  // so the 24 tiles are all distinct and one valid chain always exists
  const unused = new Set();
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) unused.add(a + "-" + b);
  const key = (a, b) => (a < b ? a + "-" + b : b + "-" + a);
  const stack = [rand(7)], circuit = [];
  while (stack.length) {
    const v = stack[stack.length - 1], next = [...Array(7).keys()].filter(u => unused.has(key(v, u)));
    if (!next.length) { circuit.push(stack.pop()); continue; }
    const u = next[rand(next.length)]; unused.delete(key(v, u)); stack.push(u);
  }
  const off = rand(28), chain = [...Array(COUNT + 1)].map((_, i) => circuit[(off + i) % 28]);

  // Drawing: a random self-avoiding path of 48 cells (Warnsdorff heuristic with noise)
  let path;
  for (let tries = 0; tries < 500; tries++) {
    const seen = new Set(), p = [rand(W * H)];
    seen.add(p[0]);
    const free = k => [k - W, k + W, k % W ? k - 1 : -1, k % W < W - 1 ? k + 1 : -1].filter(n => n >= 0 && n < W * H && !seen.has(n));
    while (p.length < L) {
      const opts = free(p[p.length - 1]);
      if (!opts.length) break;
      opts.sort((a, b) => free(a).length - free(b).length);
      const n = Math.random() < 0.7 ? opts[0] : opts[rand(opts.length)];
      seen.add(n); p.push(n);
    }
    if (p.length === L) { path = p; break; }
  }

  // Tray: the 24 tiles, shuffled and randomly flipped; slots: consecutive cell pairs along the path
  const tray = [...Array(COUNT)].map((_, i) => (Math.random() < 0.5 ? [chain[i], chain[i + 1]] : [chain[i + 1], chain[i]]));
  for (let i = tray.length - 1; i > 0; i--) { const j = rand(i + 1); [tray[i], tray[j]] = [tray[j], tray[i]]; }
  const slot = Array(COUNT).fill(null);
  let sel = null, over = false;

  const xy = k => [(k % W) * 10 + 5, Math.floor(k / W) * 10 + 5];
  const board = svg("svg", { viewBox: `0 0 ${W * 10} ${H * 10}`, class: "domino-board" });
  const trayEl = el("div", "tray");

  function tapSlot(s) {
    if (over) return;
    if (sel !== null) { if (slot[s]) tray.push(slot[s]); slot[s] = tray.splice(sel, 1)[0]; sel = null; }
    else if (slot[s]) slot[s] = [slot[s][1], slot[s][0]];
    render();
    if (slot.every(Boolean) && slot.every((d, i) => i === 0 || slot[i - 1][1] === d[0])) { over = true; ctx.win(); }
  }

  function render() {
    board.replaceChildren();
    for (let s = 0; s < COUNT; s++) {
      const [x1, y1] = xy(path[2 * s]), [x2, y2] = xy(path[2 * s + 1]);
      const g = svg("g", { class: "slot" + (slot[s] ? " full" : "") });
      g.append(svg("rect", { x: Math.min(x1, x2) - 4.4, y: Math.min(y1, y2) - 4.4, width: Math.abs(x2 - x1) + 8.8, height: Math.abs(y2 - y1) + 8.8, rx: 1.8 }));
      if (slot[s]) {
        g.append(svg("line", { x1: (x1 + x2) / 2 - (y2 - y1) * 0.35, y1: (y1 + y2) / 2 - (x2 - x1) * 0.35, x2: (x1 + x2) / 2 + (y2 - y1) * 0.35, y2: (y1 + y2) / 2 + (x2 - x1) * 0.35, class: "mid" }));
        drawPips(g, slot[s][0], x1, y1); drawPips(g, slot[s][1], x2, y2);
      }
      g.onclick = () => tapSlot(s);
      board.append(g);
    }
    // Joints between consecutive slots: gold when the touching ends match, red when they do not
    for (let s = 1; s < COUNT; s++) {
      const [ax, ay] = xy(path[2 * s - 1]), [bx, by] = xy(path[2 * s]);
      const st = slot[s - 1] && slot[s] ? (slot[s - 1][1] === slot[s][0] ? " ok" : " bad") : "";
      board.append(svg("circle", { cx: (ax + bx) / 2, cy: (ay + by) / 2, r: 1.1, class: "joint" + st }));
    }
    trayEl.replaceChildren(...tray.map((d, i) => {
      const t = svg("svg", { viewBox: "0 0 20 10", class: "tile" + (sel === i ? " sel" : "") });
      t.append(svg("rect", { x: 0.5, y: 0.5, width: 19, height: 9, rx: 1.8 }), svg("line", { x1: 10, y1: 1.5, x2: 10, y2: 8.5, class: "mid" }));
      drawPips(t, d[0], 5, 5); drawPips(t, d[1], 15, 5);
      t.onclick = () => { if (!over) { sel = sel === i ? null : i; render(); } };
      return t;
    }));
    ctx.status(`${slot.filter(Boolean).length}/${COUNT}`);
  }
  root.replaceChildren(board, trayEl);
  render();
}

const PUZZLES = [
  { id: "p24", icon: "24", init: make24 },
  { id: "slide", icon: "▦", init: slide },
  { id: "nono", icon: "▚", init: nonogram },
  { id: "lights", icon: "◐", init: lights },
  { id: "push", icon: "▣", init: crates },
  { id: "pipes", icon: "╋", init: circuit },
  { id: "domino", icon: "⚁", init: dominoes },
];
