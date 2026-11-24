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
