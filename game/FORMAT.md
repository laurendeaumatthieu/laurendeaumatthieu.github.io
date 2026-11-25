# Story format (v3)

The story source lives outside this public repository (private, spoilers). Build it with:

    python3 tools/build_story.py <story_dir> game/story.js

The player is an investigator using the colony terminal. Content is a graph of **nodes** (novel chapters,
room searches, interrogations, evidence, puzzles) and **reconstructions** (past scenes rebuilt from
sensor data). Everything is encrypted: a node opens with a random key handed over by whatever unlocks
it; a reconstruction opens with its exact (moment, place, people); a puzzle reward with its answer.

## `<story_dir>/meta.json` (public part: no spoilers here)

- `title`: game title. `intro`: list of paragraphs shown before the first chapter (boot screen).
- `fields`: identity sheet columns, first = name, e.g. `[{ "label": "Nom", "options": [{ "label": "…", "group": "Équipage" }, "…"] }, { "label": "Rôle", "options": ["…"] }]`.
- `people`: `{ "1": { "aka": "La femme au casque rayé", "sheet": [4, 2], "look": { … } } }`.
  `aka` is the default nickname (visual, no spoiler); `sheet` the secret answer (one option index per field);
  `look` optional portrait hints: `hair` (`short`, `long`, `bun`, `curly`, `bald`, `helmet`), `skin`, `hair_color`, `outfit` (CSS colors).
  A sheet is confirmed only when all fields are right, three at a time (fewer for the last ones).
- `moments`: whole timeline in order, `[{ "id": "d1-08", "label": "Jour 1 · 08 h", "locked": true }]`.
- `places`: map rooms `[{ "id": "dome", "label": "Le dôme", "x": 10, "y": 5, "w": 20, "h": 12, "locked": true }]`
  on a 100 × 60 grid, not overlapping. Locked rooms are hidden until unlocked.
- `start`: node ids available at the beginning (typically the first chapter).
- `final`: `{ "text": "… {0} … {1} …", "options": [[…], […]], "answer": [i, j], "ending": { "title", "lines": ["…"] } }`.

## Nodes: `<story_dir>/nodes/*.json` (lists)

Common: `id`, `type`, `title`. Text fields are lists of paragraphs.

- `chapter`: `{ "text": [...], "unlock": {...} }` novel prose, read in the Journal; unlock applies once opened.
- `search`: `{ "place": "<place id>", "text": [...], "objects": [{ "label", "text": [...], "unlock": {...} }] }`
  a room search, opened from the map; each object unlocks once examined.
- `talk`: `{ "person": n, "text": [...], "topics": [{ "q": "Question", "lines": [[n, "…"], [-1, "…"], [0, "narration"]], "show": "<evidence id>", "unlock": {...} }] }`
  an interrogation. A topic with `show` appears only once that evidence is held ("Montrer : …").
  Speakers: the person, -1 (the investigator) or 0 (narration).
- `evidence`: `{ "text": [...] }` an item or document kept in the Evidence tab.
- `puzzle`: `{ "prompt": "…", "kind": "code" | "game", "game": "<id from assets/puzzles.js>", "answer": "…", "reward": { "text", "unlock" } }`.
  Code answers are compared without case, accents, spaces or punctuation.

## Reconstructions: `<story_dir>/scenes/*.json` (lists)

    { "id": "r001", "moment": "d1-08", "place": "dome", "people": [1, 3], "title": "…",
      "lines": [[1, "Dialogue"], [0, "Narration"]], "unlock": {...} }

At most one per (moment, place). On the map, a room at a moment shows how many silhouettes the sensors
saw there (only where a reconstruction exists); the player names them all to rebuild the scene.

## `unlock`

`nodes` (ids), `places` (ids), `moments` (ids), `people` (numbers: dossiers opened before meeting),
`message` (string or paragraphs shown once in a dialog), `final: true` (opens the conclusion).

## Build checks

One reconstruction per (moment, place); speakers present (or 0 / -1 in talks); every referenced id
exists; every node and reconstruction is reachable from `start` (people known, moment and place
unlocked, `show` evidence held; puzzles assumed solved).
