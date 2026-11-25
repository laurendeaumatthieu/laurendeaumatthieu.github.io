# Story format

The story source lives outside this public repository (private, spoilers). Build it with:

    python3 tools/build_story.py <story_dir> game/story.js

## `<story_dir>/meta.json`

- `title`: game title shown in the header.
- `intro`: list of paragraphs shown at the first visit (no spoilers).
- `moments`: ordered timeline, `[{ "id": "mon-09", "label": "Lundi · 9 h" }]`. Visible from the start unless `"locked": true` (then shown once unlocked).
- `places`: places available from the start, `[{ "id": "port", "label": "Le port" }]`. Others come from `unlock`.
- `fields`: identity sheet columns, the first being the name (Obra Dinn style), e.g.
  `[{ "label": "Nom", "options": [{ "label": "…", "group": "Équipage" }, "…"] }, { "label": "Secret", "options": ["…"] }]`.
  Options are strings or `{ label, group }` (groups become `<optgroup>`).
- `who`: secret sheet per person number, one option index per field, `{ "1": [4, 2], "2": [0, 1] }`.
  A sheet is confirmed only when every field is right, three sheets at a time (fewer for the last ones).
- `aka`: optional default nickname per person, `{ "1": "La pilote au foulard" }` (public, no spoiler);
  people without one appear as `#n` until renamed or identified.
- `start`: ids of the scenes unlocked at the beginning.
- `puzzles`: `{ "<pid>": { "title", "prompt", "type": "code" | "game", "game": "<puzzle id from assets/puzzles.js>" (type game), "answer": "<text>" (type code; compared without case, accents, spaces or punctuation), "reward": { "text", "unlock" } } }`.
- `final`: `{ "text": "… {0} … {1} …", "options": [[…], […]], "answer": [i, j], "ending": { "title", "lines": ["…"] } }`.

## `<story_dir>/scenes/*.json`

Each file is a list of scenes:

    { "id": "s001", "moment": "mon-09", "place": "port", "people": [1, 3], "title": "…", "lead": true,
      "lines": [[1, "Dialogue line"], [0, "Narration (speaker 0)"]],
      "unlock": { "places": [{ "id": "lighthouse", "label": "Le phare" }], "puzzles": ["<pid>"] } }

`unlock` (in a scene or a puzzle reward) may contain `places` (objects), `puzzles` (ids), `moments` (ids),
`people` (numbers made selectable before they are met), `final: true` (shows the ending tab; set it
in the last chapter) and `message` (string or list of paragraphs, shown
once in a dialog, e.g. at the end of a chapter).

Rules checked by the build: at most one scene per (moment, place); speakers are present people or 0;
every referenced moment, place, person and puzzle exists; every scene is reachable from the start
(moment unlocked, place available, people known), following puzzle rewards, including nested ones.

## Keys

A scene opens with the exact triple (moment, place, sorted people). The scene is encrypted with
SHA-256 of `scene|moment|place|p1,p2,…`; puzzles with `puz|pid|answer` (`win` for games); the ending
with `fin|i|j|…`; a sheet with `who|n|i|j|…`. The engine only stores, per (moment, place), the number of people present (hint).
