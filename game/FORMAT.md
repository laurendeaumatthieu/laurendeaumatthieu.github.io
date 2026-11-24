# Story format

The story source lives outside this public repository (private, spoilers). Build it with:

    python3 tools/build_story.py <story_dir> game/story.js

## `<story_dir>/meta.json`

- `title`: game title shown in the header.
- `intro`: list of paragraphs shown at the first visit (no spoilers).
- `moments`: ordered timeline, `[{ "id": "mon-09", "label": "Lundi · 9 h" }]`. All visible from the start.
- `places`: places available from the start, `[{ "id": "port", "label": "Le port" }]`. Others come from `unlock`.
- `cast`: identification list, `[{ "name": "…", "role": "…" }]`. Order is free.
- `who`: secret mapping person number → index in `cast`, `{ "1": 4, "2": 0 }`. People appear as `#n` until identified (confirmed three at a time).
- `start`: ids of the scenes unlocked at the beginning.
- `puzzles`: `{ "<pid>": { "title", "prompt", "type": "code" | "game", "game": "<puzzle id from assets/puzzles.js>" (type game), "answer": "<text>" (type code; compared without case, accents, spaces or punctuation), "reward": { "text", "unlock" } } }`.
- `final`: `{ "text": "… {0} … {1} …", "options": [[…], […]], "answer": [i, j], "ending": { "title", "lines": ["…"] } }`.

## `<story_dir>/scenes/*.json`

Each file is a list of scenes:

    { "id": "s001", "moment": "mon-09", "place": "port", "people": [1, 3], "title": "…", "lead": true,
      "lines": [[1, "Dialogue line"], [0, "Narration (speaker 0)"]],
      "unlock": { "places": [{ "id": "lighthouse", "label": "Le phare" }], "puzzles": ["<pid>"] } }

Rules checked by the build: at most one scene per (moment, place); speakers are present people or 0;
every referenced moment, place, person and puzzle exists.

## Keys

A scene opens with the exact triple (moment, place, sorted people). The scene is encrypted with
SHA-256 of `scene|moment|place|p1,p2,…`; puzzles with `puz|pid|answer` (`win` for games); the ending
with `fin|i|j|…`. The engine only stores, per (moment, place), the number of people present (hint).
