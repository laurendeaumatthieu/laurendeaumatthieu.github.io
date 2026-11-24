// Translations: English is the default, French is the alternative
const I18N = {
  en: {
    "puzzles.title": "Puzzles", "puzzles.intro": "Seven small puzzles, all made for this page. Pick one and take a break.",
    "footer": "Zero trackers.", "nav.game": "Back to the game", "hero.hello": "Hi, I'm", "hero.scroll": "Puzzles ↓",
    "game.new": "New game", "game.solved": "Solved! ✦", "game.moves": "Moves",
    "p24.name": "Make 24", "p24.desc": "Four numbers, one target.",
    "p24.rules": "Combine the four numbers with + − × ÷ to reach exactly 24. Pick a number, an operator, then another number.",
    "p24.undo": "Undo",
    "slide.name": "Slide", "slide.desc": "Put the tiles back in order.",
    "slide.rules": "Tap a tile next to the empty space to slide it. Order 1 to 8.",
    "nono.name": "Picture grid", "nono.desc": "Numbers draw the picture.",
    "nono.rules": "Clues give the runs of filled cells in each row and column. Tap to fill, tap again to mark ✕, once more to clear.",
    "lights.name": "Lights", "lights.desc": "Turn every light off.",
    "lights.rules": "Tapping a cell toggles it and its four neighbours. Switch them all off.",
    "push.name": "Crates", "push.desc": "Push, never pull.",
    "push.rules": "Push every red crate onto a gold target. Arrow keys, swipe, or the pad below.",
    "push.level": "Level",
    "pipes.name": "Circuit", "pipes.desc": "Rotate until it all connects.",
    "pipes.rules": "Tap a piece to rotate it. Every pipe end must meet another one, with none left open.",
    "domino.name": "Dominoes", "domino.desc": "24 tiles, one winding chain.",
    "domino.rules": "Fill the drawing with all 24 tiles. Touching ends must show the same number. Tap a tile, then a slot; tap a placed tile to flip it."
  },
  fr: {
    "puzzles.title": "Puzzles", "puzzles.intro": "Sept petits puzzles, tous créés pour cette page. Choisissez-en un et faites une pause.",
    "footer": "Zéro traceur.", "nav.game": "Retour au jeu", "hero.hello": "Salut, moi c'est", "hero.scroll": "Puzzles ↓",
    "game.new": "Nouvelle partie", "game.solved": "Résolu ! ✦", "game.moves": "Coups",
    "p24.name": "Faire 24", "p24.desc": "Quatre nombres, une cible.",
    "p24.rules": "Combinez les quatre nombres avec + − × ÷ pour obtenir exactement 24. Choisissez un nombre, un opérateur, puis un autre nombre.",
    "p24.undo": "Annuler",
    "slide.name": "Taquin", "slide.desc": "Remettez les tuiles dans l'ordre.",
    "slide.rules": "Touchez une tuile voisine de la case vide pour la déplacer. Ordre de 1 à 8.",
    "nono.name": "Grille image", "nono.desc": "Les nombres dessinent l'image.",
    "nono.rules": "Les indices donnent les suites de cases pleines de chaque ligne et colonne. Touchez pour remplir, encore pour marquer ✕, encore pour effacer.",
    "lights.name": "Lumières", "lights.desc": "Éteignez toutes les lumières.",
    "lights.rules": "Toucher une case l'inverse ainsi que ses quatre voisines. Éteignez tout.",
    "push.name": "Caisses", "push.desc": "Pousser, jamais tirer.",
    "push.rules": "Poussez chaque caisse rouge sur une cible dorée. Flèches, glisser, ou le pavé ci-dessous.",
    "push.level": "Niveau",
    "pipes.name": "Circuit", "pipes.desc": "Tournez jusqu'à tout connecter.",
    "pipes.rules": "Touchez une pièce pour la tourner. Chaque extrémité doit en rejoindre une autre, aucune ne reste ouverte.",
    "domino.name": "Dominos", "domino.desc": "24 tuiles, une chaîne sinueuse.",
    "domino.rules": "Remplissez le dessin avec les 24 tuiles. Les extrémités qui se touchent doivent porter le même nombre. Touchez une tuile, puis un emplacement ; touchez une tuile posée pour la retourner."
  }
};

let lang = "en";
try { lang = localStorage.getItem("lang") || "en"; } catch (e) { /* storage unavailable */ }

function t(key) { return I18N[lang][key] ?? I18N.en[key] ?? key; }

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.getElementById("lang").textContent = lang === "en" ? "FR" : "EN";
}
