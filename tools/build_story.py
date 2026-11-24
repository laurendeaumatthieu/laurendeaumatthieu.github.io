#!/usr/bin/env python3
"""Build the encrypted story file read by the game engine.

Usage: python3 tools/build_story.py <story_dir> <out.js>

<story_dir> holds meta.json and scenes/*.json (format in game/FORMAT.md). Every secret
payload (scene, puzzle reward, ending) is encrypted with a key derived from the
answer that opens it, so the published file reveals nothing without playing.
"""
import base64, hashlib, json, sys, unicodedata
from pathlib import Path


def sha(b: bytes) -> bytes:
    return hashlib.sha256(b).digest()


def key(kind: str, parts) -> bytes:
    return sha("|".join([kind, *map(str, parts)]).encode())


def ident(k: bytes) -> str:
    return sha(b"id|" + k).hex()[:16]


def encrypt(k: bytes, obj) -> str:
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
    stream = b"".join(sha(k + i.to_bytes(4, "big")) for i in range(len(data) // 32 + 1))
    return base64.b64encode(bytes(a ^ b for a, b in zip(data, stream))).decode()


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower())
    return "".join(c for c in s if c.isalnum() and not unicodedata.combining(c))


def scene_key(s) -> bytes:
    return key("scene", [s["moment"], s["place"], ",".join(map(str, sorted(s["people"])))])


def main(story_dir: str, out: str):
    root = Path(story_dir)
    meta = json.loads((root / "meta.json").read_text())
    scenes = [s for f in sorted((root / "scenes").glob("*.json")) for s in json.loads(f.read_text())]
    puzzles = meta.get("puzzles", {})
    moments = {m["id"] for m in meta["moments"]}
    places = {p["id"] for p in meta["places"]}
    places |= {p["id"] for s in scenes for p in s.get("unlock", {}).get("places", [])}
    places |= {p["id"] for z in puzzles.values() for p in z["reward"].get("unlock", {}).get("places", [])}
    who = {int(k): v for k, v in meta["who"].items()}

    # Consistency checks: one scene per (moment, place), known ids everywhere
    seen = {}
    for s in scenes:
        slot = (s["moment"], s["place"])
        assert slot not in seen, f"two scenes at {slot}: {seen[slot]} and {s['id']}"
        seen[slot] = s["id"]
        assert s["moment"] in moments, f"{s['id']}: unknown moment {s['moment']}"
        assert s["place"] in places, f"{s['id']}: unknown place {s['place']}"
        for p in s["people"]:
            assert p in who, f"{s['id']}: person {p} missing from meta.who"
        for sp, _ in s["lines"]:
            assert sp == 0 or sp in s["people"], f"{s['id']}: speaker {sp} not present"
        for pid in s.get("unlock", {}).get("puzzles", []):
            assert pid in puzzles, f"{s['id']}: unknown puzzle {pid}"

    # Reachability: a scene can be found once its place is available and all its people were met
    # in an earlier reachable scene (puzzles are assumed solved once they appear)
    reach, known, avail, opened = set(meta["start"]), set(), {p["id"] for p in meta["places"]}, set()
    changed = True
    while changed:
        changed = False
        for s in scenes:
            if s["id"] not in reach and s["place"] in avail and set(s["people"]) <= known:
                reach.add(s["id"]); changed = True
        for sid in list(reach):
            s = next(x for x in scenes if x["id"] == sid)
            u = s.get("unlock", {})
            new = set(s["people"]) - known | {p["id"] for p in u.get("places", [])} - avail
            known |= set(s["people"]); avail |= {p["id"] for p in u.get("places", [])}
            for pid in u.get("puzzles", []):
                if pid not in opened:
                    opened.add(pid); avail |= {p["id"] for p in puzzles[pid]["reward"].get("unlock", {}).get("places", [])}; changed = True
            changed |= bool(new)
    lost = [s["id"] for s in scenes if s["id"] not in reach]
    assert not lost, f"unreachable scenes: {lost}"

    def public_unlock(u):
        u = dict(u or {})
        if "puzzles" in u:
            u["puzzles"] = [{"id": pid, **{k: v for k, v in puzzles[pid].items() if k in ("title", "prompt", "type", "game")}}
                            for pid in u["puzzles"]]
        return u

    by_id = {s["id"]: s for s in scenes}
    out_scenes, hints = {}, {}
    for s in scenes:
        k = scene_key(s)
        payload = {k2: s[k2] for k2 in ("id", "title", "moment", "place", "people", "lines", "lead") if k2 in s}
        payload["unlock"] = public_unlock(s.get("unlock"))
        out_scenes[ident(k)] = encrypt(k, payload)
        hints[sha(f"hint|{s['moment']}|{s['place']}".encode()).hex()[:16]] = len(s["people"])

    answers = {}
    for pid, z in puzzles.items():
        k = key("puz", [pid, "win" if z["type"] == "game" else norm(z["answer"])])
        answers[ident(k)] = encrypt(k, {"text": z["reward"].get("text", ""), "unlock": public_unlock(z["reward"].get("unlock"))})

    fin = meta["final"]
    kf = key("fin", fin["answer"])
    story = {
        "title": meta["title"], "intro": meta["intro"], "moments": meta["moments"], "places": meta["places"],
        "cast": meta["cast"], "people": len(who),
        "who": sorted(sha(f"who|{p}|{c}".encode()).hex()[:16] for p, c in who.items()),
        "start": [scene_key(by_id[i]).hex() for i in meta["start"]],
        "scenes": out_scenes, "hints": hints, "answers": answers,
        "final": {"text": fin["text"], "options": fin["options"], "ending": {ident(kf): encrypt(kf, fin["ending"])}},
    }
    Path(out).write_text("// Generated by tools/build_story.py: do not edit\nwindow.STORY = "
                         + json.dumps(story, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"{len(scenes)} scenes, {len(puzzles)} puzzles, {len(who)} people -> {out}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
