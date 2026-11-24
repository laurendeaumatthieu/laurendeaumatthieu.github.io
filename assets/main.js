// Page wiring: language switch, puzzle modal, confetti

const $ = id => document.getElementById(id);
let current = null, handler = null;

// Language
$("lang").onclick = () => {
  lang = lang === "en" ? "fr" : "en";
  try { localStorage.setItem("lang", lang); } catch (e) { /* storage unavailable */ }
  applyLang(); renderPuzzleCards();
  if (current) { $("modal-title").textContent = t(current.id + ".name"); $("modal-rules").textContent = t(current.id + ".rules"); }
};

// Hero: layered sea waves in red and gold, slightly following the pointer
const cv = $("waves");
if (cv) {
  const g = cv.getContext("2d"), still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, mx = 0.5, my = 0.5;
  const fit = () => { const d = devicePixelRatio || 1; w = cv.clientWidth; h = cv.clientHeight; cv.width = w * d; cv.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); };
  addEventListener("resize", fit); fit();
  addEventListener("pointermove", e => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; });
  const LAYERS = 14;
  function frame(t) {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < LAYERS; i++) {
      const k = i / (LAYERS - 1), base = h * (0.3 + 0.55 * k) + (my - 0.5) * 30 * k;
      const amp = 18 + 34 * Math.sin(k * Math.PI) + (mx - 0.5) * 20, speed = 0.00025 + k * 0.0002;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = base + amp * Math.sin(x * 0.006 + t * speed + i * 0.7) + amp * 0.4 * Math.sin(x * 0.013 - t * speed * 1.7 + i);
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = i % 3 === 0 ? `rgba(212, 162, 76, ${0.12 + 0.35 * k})` : `rgba(229, 56, 59, ${0.08 + 0.32 * k})`;
      g.lineWidth = 1 + 1.4 * k; g.stroke();
    }
    if (!still) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Puzzles
function renderPuzzleCards() {
  $("puzzle-grid").replaceChildren(...PUZZLES.map(p => {
    const c = el("button", "card");
    c.append(el("div", "icon", p.icon), el("h3", "", t(p.id + ".name")), el("p", "", t(p.id + ".desc")));
    c.onclick = () => openPuzzle(p);
    return c;
  }));
}

function startGame() {
  $("status").textContent = "";
  handler = current.init($("game"), {
    win() { $("status").textContent = t("game.solved"); confetti(); },
    status(text) { $("status").textContent = text; },
  }) || null;
}

function openPuzzle(p) {
  current = p;
  $("modal-title").textContent = t(p.id + ".name");
  $("modal-rules").textContent = t(p.id + ".rules");
  startGame();
  $("modal").showModal();
}

$("new-game").onclick = startGame;
$("modal-close").onclick = () => $("modal").close();
$("modal").addEventListener("close", () => { current = handler = null; });
$("modal").addEventListener("click", e => { if (e.target === $("modal")) $("modal").close(); });
document.addEventListener("keydown", e => handler?.key?.(e));

// Confetti in red and gold
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv = $("confetti"), g = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const parts = [...Array(140)].map(() => ({
    x: innerWidth / 2, y: innerHeight / 2, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
    s: 4 + Math.random() * 5, c: Math.random() < 0.5 ? "#e5383b" : "#d4a24c", r: Math.random() * 6,
  }));
  let frame = 0;
  (function tick() {
    g.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.r += 0.1;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); g.restore();
    });
    if (++frame < 120) requestAnimationFrame(tick); else g.clearRect(0, 0, cv.width, cv.height);
  })();
}

$("year").textContent = new Date().getFullYear();
applyLang();
renderPuzzleCards();
