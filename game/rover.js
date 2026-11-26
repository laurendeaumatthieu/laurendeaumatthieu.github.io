// Rover expedition: drive from the base to a newly detected place across Martian terrain.
// rover(root, { seed, level, label }, { win, status }) renders the game and returns a stop function.
// Fog of war clears where the rover drives; craters slow it down, rocks bounce it; the battery must last.
(() => {
const W = 600, H = 400;

function rng(seed) {
  let a = [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function world(seed, level) {
  const r = rng(seed), lv = Math.min(level, 8);
  const base = { x: 50, y: H - 50 }, goal = { x: W - 60 - r() * 80, y: 50 + r() * 120 };
  const far = (x, y, d) => Math.hypot(x - base.x, y - base.y) > d && Math.hypot(x - goal.x, y - goal.y) > d;
  const craters = [], rocks = [], cells = [];
  for (let i = 0; craters.length < 3 + Math.ceil(lv / 2) && i < 200; i++) {
    const c = { x: r() * W, y: r() * H, r: 26 + r() * 26 };
    if (far(c.x, c.y, c.r + 40)) craters.push(c);
  }
  for (let i = 0; rocks.length < 16 + lv * 5 && i < 600; i++) {
    const k = { x: r() * W, y: r() * H, r: 6 + r() * 10 };
    if (far(k.x, k.y, k.r + 34)) rocks.push(k);
  }
  for (let i = 0; cells.length < 3 && i < 200; i++) {
    const c = { x: 80 + r() * (W - 160), y: 60 + r() * (H - 120), taken: false };
    if (far(c.x, c.y, 80) && !rocks.some(k => Math.hypot(k.x - c.x, k.y - c.y) < k.r + 14)) cells.push(c);
  }
  // Ground texture: dust speckles and dune streaks, drawn once
  const ground = document.createElement("canvas"); ground.width = W; ground.height = H;
  const g = ground.getContext("2d");
  g.fillStyle = "#4a1f14"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${150 + r() * 80}, ${60 + r() * 40}, ${30 + r() * 20}, ${r() * .25})`; g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2); }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(230, 140, 90, ${.04 + r() * .05})`; g.lineWidth = 2 + r() * 4; g.beginPath();
    const x = r() * W, y = r() * H; g.moveTo(x, y); g.quadraticCurveTo(x + 30, y - 10 + r() * 20, x + 60 + r() * 40, y + r() * 10); g.stroke();
  }
  craters.forEach(c => {
    const gr = g.createRadialGradient(c.x - c.r * .3, c.y - c.r * .3, c.r * .2, c.x, c.y, c.r);
    gr.addColorStop(0, "#2a100a"); gr.addColorStop(.85, "#3b160d"); gr.addColorStop(1, "#a0573a");
    g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, c.r, 0, 7); g.fill();
  });
  rocks.forEach(k => {
    g.fillStyle = "rgba(0, 0, 0, .35)"; g.beginPath(); g.ellipse(k.x + 3, k.y + 3, k.r, k.r * .8, 0, 0, 7); g.fill();
    g.fillStyle = "#6e3a28"; g.beginPath(); g.arc(k.x, k.y, k.r, 0, 7); g.fill();
    g.fillStyle = "rgba(255, 200, 160, .18)"; g.beginPath(); g.arc(k.x - k.r * .3, k.y - k.r * .3, k.r * .45, 0, 7); g.fill();
  });
  return { base, goal, craters, rocks, cells, ground, drain: 0.045 * (1 + lv * 0.1) };
}

function rover(root, { seed, level = 0, label = "" }, ctx) {
  root.replaceChildren();
  const cv = document.createElement("canvas"), dpr = devicePixelRatio || 1;
  cv.className = "rover"; cv.width = W * dpr; cv.height = H * dpr; cv.tabIndex = 0;
  const pad = document.createElement("div"); pad.className = "rover-pad";
  const keys = new Set(), btn = (t, k) => {
    const b = document.createElement("button"); b.className = "chip"; b.textContent = t; b.type = "button";
    const on = e => { e.preventDefault(); keys.add(k); }, off = () => keys.delete(k);
    b.addEventListener("pointerdown", on); ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, off));
    return b;
  };
  pad.append(btn("◀", "l"), btn("▲", "u"), btn("▼", "d"), btn("▶", "r"));
  root.append(cv, pad);
  const g = cv.getContext("2d"); g.scale(dpr, dpr);
  const w = world(seed, level), fog = document.createElement("canvas"), tracks = document.createElement("canvas");
  fog.width = tracks.width = W; fog.height = tracks.height = H;
  const fg = fog.getContext("2d"), tg = tracks.getContext("2d");
  let car, dust, running = true, over = false, raf;

  function reset() {
    car = { x: w.base.x, y: w.base.y, a: -Math.PI / 4, v: 0, bat: 100 };
    dust = []; over = false; w.cells.forEach(c => { c.taken = false; });
    fg.globalCompositeOperation = "source-over"; fg.fillStyle = "rgba(6, 4, 4, .88)"; fg.fillRect(0, 0, W, H);
    tg.clearRect(0, 0, W, H);
    ctx.status(`Destination : ${label}. Flèches ou boutons (ou maintenir le doigt sur la carte) pour conduire.`);
  }
  reset();

  const down = e => {
    const k = { ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d", a: "l", q: "l", d: "r", w: "u", z: "u", s: "d" }[e.key];
    if (k) { keys.add(k); e.preventDefault(); }
    if (over && (e.key === "Enter" || e.key === " ")) reset();
  };
  const up = e => { const k = { ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d", a: "l", q: "l", d: "r", w: "u", z: "u", s: "d" }[e.key]; if (k) keys.delete(k); };
  addEventListener("keydown", down); addEventListener("keyup", up);
  let aim = null;
  const pt = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height }; };
  cv.addEventListener("pointerdown", e => { if (over) { reset(); return; } aim = pt(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", e => { if (aim) aim = pt(e); });
  ["pointerup", "pointercancel"].forEach(ev => cv.addEventListener(ev, () => { aim = null; }));

  function step(dt) {
    if (over) return;
    let turn = (keys.has("r") ? 1 : 0) - (keys.has("l") ? 1 : 0), gas = (keys.has("u") ? 1 : 0) - (keys.has("d") ? 0.6 : 0);
    if (aim) {
      const want = Math.atan2(aim.y - car.y, aim.x - car.x);
      const diff = Math.atan2(Math.sin(want - car.a), Math.cos(want - car.a));
      turn = Math.max(-1, Math.min(1, diff * 3)); gas = Math.hypot(aim.x - car.x, aim.y - car.y) > 14 ? 1 : 0;
    }
    const inCrater = w.craters.some(c => Math.hypot(c.x - car.x, c.y - car.y) < c.r);
    const top = inCrater ? 0.9 : 2.2;
    car.a += turn * 0.06 * dt * (Math.abs(car.v) > 0.1 ? 1 : 0.5);
    car.v += gas * 0.12 * dt; car.v *= 0.94 ** dt; car.v = Math.max(-1.2, Math.min(top, car.v));
    const nx = car.x + Math.cos(car.a) * car.v * dt, ny = car.y + Math.sin(car.a) * car.v * dt;
    const hit = w.rocks.find(k => Math.hypot(k.x - nx, k.y - ny) < k.r + 8) || nx < 8 || ny < 8 || nx > W - 8 || ny > H - 8;
    if (hit) {
      if (Math.abs(car.v) > 0.6) { car.bat -= 4; window.sfx?.("miss"); g.canvas.classList.remove("shake"); void cv.offsetWidth; cv.classList.add("shake"); }
      car.v *= -0.4;
    } else {
      const moved = Math.hypot(nx - car.x, ny - car.y);
      car.bat -= moved * w.drain;
      tg.fillStyle = "rgba(30, 10, 6, .35)";
      [-1, 1].forEach(s => tg.fillRect(car.x + Math.cos(car.a + Math.PI / 2) * 5 * s - 1, car.y + Math.sin(car.a + Math.PI / 2) * 5 * s - 1, 2, 2));
      car.x = nx; car.y = ny;
      if (moved > 0.5 && Math.random() < 0.6) dust.push({ x: car.x - Math.cos(car.a) * 9, y: car.y - Math.sin(car.a) * 9, r: 2, life: 1 });
    }
    fg.globalCompositeOperation = "destination-out";
    const hole = fg.createRadialGradient(car.x, car.y, 20, car.x, car.y, 70);
    hole.addColorStop(0, "rgba(0, 0, 0, 1)"); hole.addColorStop(1, "rgba(0, 0, 0, 0)");
    fg.fillStyle = hole; fg.beginPath(); fg.arc(car.x, car.y, 70, 0, 7); fg.fill();
    w.cells.forEach(c => { if (!c.taken && Math.hypot(c.x - car.x, c.y - car.y) < 14) { c.taken = true; car.bat = Math.min(100, car.bat + 25); window.sfx?.("discover"); } });
    if (Math.hypot(w.goal.x - car.x, w.goal.y - car.y) < 18) {
      over = true; running = false; window.sfx?.("solve");
      ctx.status(`Arrivée : ${label}.`); setTimeout(ctx.win, 600); return;
    }
    if (car.bat <= 0) { car.bat = 0; over = true; window.sfx?.("fail"); ctx.status("Batterie vide. Le rover est remorqué à la base : touchez la carte ou Entrée pour repartir."); }
  }

  function draw(t) {
    g.drawImage(w.ground, 0, 0); g.drawImage(tracks, 0, 0);
    // Base and battery cells
    g.strokeStyle = "rgba(111, 214, 232, .7)"; g.lineWidth = 1.5; g.beginPath(); g.arc(w.base.x, w.base.y, 16, 0, 7); g.stroke();
    w.cells.forEach(c => { if (c.taken) return; g.fillStyle = `rgba(111, 214, 232, ${0.6 + 0.4 * Math.sin(t / 200)})`; g.fillRect(c.x - 4, c.y - 6, 8, 12); g.fillStyle = "#0d0a09"; g.fillRect(c.x - 2, c.y - 2, 4, 1); });
    dust = dust.filter(p => (p.life -= 0.03) > 0);
    dust.forEach(p => { p.r += 0.25; g.fillStyle = `rgba(210, 130, 90, ${p.life * .35})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); });
    // Rover body, wheels and headlights
    g.save(); g.translate(car.x, car.y); g.rotate(car.a);
    const beam = g.createRadialGradient(10, 0, 2, 40, 0, 40); beam.addColorStop(0, "rgba(255, 240, 200, .35)"); beam.addColorStop(1, "rgba(255, 240, 200, 0)");
    g.fillStyle = beam; g.beginPath(); g.moveTo(8, -4); g.lineTo(50, -18); g.lineTo(50, 18); g.lineTo(8, 4); g.fill();
    g.fillStyle = "#1a1210"; [[-7, -8], [3, -8], [-7, 6], [3, 6]].forEach(([x, y]) => g.fillRect(x, y, 6, 2.5));
    g.fillStyle = "#e9e0d2"; g.fillRect(-9, -6, 18, 12); g.fillStyle = "#f0b45a"; g.fillRect(2, -4, 5, 8);
    g.fillStyle = "#6fd6e8"; g.fillRect(-7, -4, 6, 8);
    g.restore();
    g.drawImage(fog, 0, 0);
    // Goal beacon pings through the fog
    const ping = (t / 1400) % 1;
    g.strokeStyle = `rgba(229, 56, 59, ${1 - ping})`; g.lineWidth = 2; g.beginPath(); g.arc(w.goal.x, w.goal.y, 6 + ping * 30, 0, 7); g.stroke();
    g.fillStyle = "#e5383b"; g.beginPath(); g.arc(w.goal.x, w.goal.y, 4, 0, 7); g.fill();
    // HUD: battery, distance, heading to the signal
    g.fillStyle = "rgba(8, 6, 6, .75)"; g.fillRect(8, 8, 172, 40);
    g.fillStyle = "#6fd6e8"; g.font = "10px JetBrains Mono, monospace";
    g.fillText(`BATTERIE ${Math.ceil(car.bat)} %`, 14, 21);
    g.fillText(`SIGNAL ${Math.round(Math.hypot(w.goal.x - car.x, w.goal.y - car.y) * 4)} m`, 14, 39);
    g.fillStyle = car.bat > 30 ? "#6fd6e8" : "#e5383b"; g.fillRect(104, 14, 70 * car.bat / 100, 8);
    g.strokeStyle = "rgba(111, 214, 232, .6)"; g.strokeRect(104, 14, 70, 8);
    if (over && car.bat <= 0) { g.fillStyle = "rgba(8, 6, 6, .6)"; g.fillRect(0, 0, W, H); g.fillStyle = "#e5383b"; g.font = "700 16px JetBrains Mono, monospace"; g.textAlign = "center"; g.fillText("BATTERIE VIDE · touchez pour repartir", W / 2, H / 2); g.textAlign = "start"; }
  }

  // Time-based steps (60 Hz units) so speed does not depend on the screen refresh rate
  let last = 0;
  function loop(t) { const dt = last ? Math.min(3, (t - last) / 16.67) : 1; last = t; step(dt); draw(t); if (running) raf = requestAnimationFrame(loop); }
  raf = requestAnimationFrame(loop);
  cv.focus();
  return () => { running = false; cancelAnimationFrame(raf); removeEventListener("keydown", down); removeEventListener("keyup", up); };
}

window.rover = rover; rover.world = world;
})();
