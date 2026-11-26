// Game effects: synthesized sounds (Web Audio, no files), ambient drone, drifting dust sky, spark bursts.
// Exposes sfx(name), burst(x, y) and the #sound / #ambient header toggles.

(() => {
const FX = { ctx: null, master: null, drone: null };
const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
let soundOn = pref("lantern-sound", "1") === "1", ambientOn = pref("lantern-ambient", "0") === "1";
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Audio context is created on the first sound, which always follows a click
function audio() {
  if (!FX.ctx) {
    FX.ctx = new (window.AudioContext || window.webkitAudioContext)();
    FX.master = FX.ctx.createGain(); FX.master.gain.value = 0.5; FX.master.connect(FX.ctx.destination);
  }
  if (FX.ctx.state === "suspended") FX.ctx.resume();
  return FX.ctx;
}

// One enveloped oscillator note
function tone(freq, { at = 0, dur = 0.25, type = "sine", vol = 0.2, slide = 0 } = {}) {
  const c = audio(), t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(FX.master); o.start(t); o.stop(t + dur + 0.05);
}

// Filtered noise burst (dust, static)
function noise({ at = 0, dur = 0.4, vol = 0.12, freq = 800 } = {}) {
  const c = audio(), t = c.currentTime + at, b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = b; f.type = "bandpass"; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(freq / 4, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(FX.master); s.start(t);
}

const SOUNDS = {
  tick: () => tone(1200, { dur: 0.05, vol: 0.05, type: "triangle" }),
  light: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { at: i * 0.07, dur: 1.2, type: "triangle", vol: 0.12 })); noise({ dur: 0.6, vol: 0.05, freq: 4000 }); },
  miss: () => { noise({ dur: 0.5, vol: 0.08, freq: 600 }); tone(220, { dur: 0.4, slide: 0.6, vol: 0.06 }); },
  hint: () => { tone(440, { dur: 0.5, slide: 0.9, type: "triangle", vol: 0.08 }); tone(446, { at: 0.08, dur: 0.5, slide: 0.9, vol: 0.06 }); },
  discover: () => { tone(1319, { dur: 0.3, vol: 0.08 }); tone(1760, { at: 0.1, dur: 0.5, vol: 0.08 }); },
  pin: () => tone(880, { dur: 0.12, type: "square", vol: 0.03, slide: 1.5 }),
  confirm: () => [392, 494, 587, 784].forEach((f, i) => tone(f, { at: i * 0.1, dur: 0.6, type: "triangle", vol: 0.12 })),
  fail: () => { tone(330, { dur: 0.18, type: "square", vol: 0.04 }); tone(247, { at: 0.16, dur: 0.3, type: "square", vol: 0.04 }); },
  solve: () => [523, 659, 784, 1047].forEach((f, i) => { tone(f, { at: i * 0.12, dur: 0.9, type: "triangle", vol: 0.12 }); tone(f / 2, { at: i * 0.12, dur: 0.9, vol: 0.06 }); }),
};
function sfx(name) { if (soundOn) try { SOUNDS[name](); } catch (e) { /* audio unavailable */ } }

// Ambient drone: two detuned low saws under a slowly breathing low-pass filter
function setAmbient(on) {
  if (FX.drone) { const d = FX.drone; d.g.gain.setTargetAtTime(0, FX.ctx.currentTime, 0.5); setTimeout(() => d.o.forEach(o => o.stop()), 2000); FX.drone = null; }
  if (!on || !soundOn) return;
  const c = audio(), g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), depth = c.createGain();
  f.type = "lowpass"; f.frequency.value = 380; lfo.frequency.value = 0.05; depth.gain.value = 220;
  lfo.connect(depth); depth.connect(f.frequency);
  const o = [55, 55.4, 82.4].map(fr => { const x = c.createOscillator(); x.type = "sawtooth"; x.frequency.value = fr; x.connect(f); x.start(); return x; });
  lfo.start(); o.push(lfo);
  g.gain.value = 0; g.gain.setTargetAtTime(0.05, c.currentTime, 2); f.connect(g); g.connect(FX.master);
  FX.drone = { o, g };
}

function renderToggles() {
  document.getElementById("sound").textContent = soundOn ? "son ♪" : "son ✕";
  document.getElementById("ambient").textContent = ambientOn ? "ambiance ∿" : "ambiance ✕";
}
document.getElementById("sound").onclick = () => { soundOn = !soundOn; setPref("lantern-sound", soundOn ? "1" : "0"); setAmbient(ambientOn); renderToggles(); sfx("tick"); };
document.getElementById("ambient").onclick = () => { ambientOn = !ambientOn; setPref("lantern-ambient", ambientOn ? "1" : "0"); setAmbient(ambientOn); renderToggles(); };
// Browsers only allow audio after a gesture: resume the saved ambient on the first click
document.addEventListener("pointerdown", () => { if (ambientOn) setAmbient(true); }, { once: true });
renderToggles();

// Sky: slow red and gold dust drifting over faint stars, plus spark bursts
const sky = document.getElementById("sky"), g = sky.getContext("2d");
let W, H, sparks = [], sat = null;
const fit = () => { const d = devicePixelRatio || 1; W = innerWidth; H = innerHeight; sky.width = W * d; sky.height = H * d; g.setTransform(d, 0, 0, d, 0, 0); };
addEventListener("resize", fit); fit();
const stars = [...Array(140)].map(() => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * 6 }));
const dust = [...Array(60)].map(() => ({ x: Math.random(), y: Math.random(), r: Math.random() * 2 + 0.5, v: Math.random() * 0.00004 + 0.00001, gold: Math.random() < 0.4 }));

function burst(x, y, n = 40) {
  if (calm) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = Math.random() * 4 + 1;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, life: 1, gold: Math.random() < 0.7 });
  }
}

function frame(t) {
  g.clearRect(0, 0, W, H);
  stars.forEach(s => { g.fillStyle = `rgba(255, 240, 220, ${0.25 + 0.25 * Math.sin(t * 0.001 + s.p)})`; g.fillRect(s.x * W, s.y * H, s.r, s.r); });
  dust.forEach(d => {
    d.x = (d.x + d.v * 16) % 1; d.y = (d.y + Math.sin(t * 0.0003 + d.r) * 0.00005 + 1) % 1;
    g.fillStyle = d.gold ? "rgba(212, 162, 76, .35)" : "rgba(229, 56, 59, .3)";
    g.beginPath(); g.arc(d.x * W, d.y * H, d.r, 0, 7); g.fill();
  });
  // Phobos crossing the sky every few minutes, and an occasional orbiting satellite
  const ph = ((t / 240000) % 1) * 1.4 - 0.2, px = ph * W, py = H * (0.32 - 0.18 * Math.sin(ph * Math.PI));
  const halo = g.createRadialGradient(px, py, 0, px, py, 26); halo.addColorStop(0, "rgba(220, 190, 160, .18)"); halo.addColorStop(1, "rgba(220, 190, 160, 0)");
  g.fillStyle = halo; g.beginPath(); g.arc(px, py, 26, 0, 7); g.fill();
  g.fillStyle = "rgba(200, 170, 140, .55)"; g.beginPath(); g.ellipse(px, py, 6, 4.5, 0.4, 0, 7); g.fill();
  if (!sat && Math.random() < 0.0015) sat = { x: -10, y: Math.random() * H * 0.5, v: 1.2 + Math.random() };
  if (sat) {
    sat.x += sat.v; sat.y += sat.v * 0.12;
    g.fillStyle = `rgba(111, 214, 232, ${0.5 + 0.5 * Math.sin(t * 0.02)})`; g.fillRect(sat.x, sat.y, 2, 2);
    if (sat.x > W + 10) sat = null;
  }
  sparks = sparks.filter(p => (p.life -= 0.018) > 0);
  sparks.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.vx *= 0.98;
    g.fillStyle = p.gold ? `rgba(240, 190, 90, ${p.life})` : `rgba(229, 56, 59, ${p.life})`;
    g.beginPath(); g.arc(p.x, p.y, 2.2 * p.life + 0.5, 0, 7); g.fill();
  });
  if (!calm) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.sfx = sfx; window.burst = burst;
})();
