#!/usr/bin/env python3
"""Build the encrypted story file read by the game engine (format v3, see game/FORMAT.md).

Usage: python3 tools/build_story.py <story_dir> <out.js>

Nodes are encrypted with keys derived from a secret salt (<story_dir>/.build_salt, stable across rebuilds so saves survive)
and handed over by whatever unlocks them; reconstructions with
their exact (moment, place, people); puzzle rewards with their answer; the ending with its choices.
The published file reveals nothing without playing.
"""
import base64, hashlib, json, os, sys, unicodedata
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


def load_lists(folder: Path):
    return [x for f in sorted(folder.glob("*.json")) for x in json.loads(f.read_text())]


def unlocks_of(item):
    """Every unlock block carried by a node or a reconstruction (puzzle rewards included)."""
    t = item.get("type")
    if t == "search":
        return [o.get("unlock", {}) for o in item["objects"]]
    if t == "talk":
        return [tp.get("unlock", {}) for tp in item["topics"]]
    if t == "puzzle":
        return [item["reward"].get("unlock", {})]
    return [item.get("unlock", {})]


def main(story_dir: str, out: str):
    root = Path(story_dir)
    meta = json.loads((root / "meta.json").read_text())
    nodes = {n["id"]: n for n in load_lists(root / "nodes")}
    scenes = load_lists(root / "scenes")
    moments = {m["id"] for m in meta["moments"]}
    places = {p["id"] for p in meta["places"]}
    people = {int(k): v for k, v in meta["people"].items()}
    fields = meta["fields"]
    types = {"chapter", "search", "talk", "evidence", "puzzle"}

    # Consistency checks
    for p, v in people.items():
        sh = v["sheet"]
        assert len(sh) == len(fields) and all(0 <= i < len(f["options"]) for i, f in zip(sh, fields)), f"bad sheet for person {p}"
    for n in nodes.values():
        assert n["type"] in types, f"{n['id']}: unknown type {n['type']}"
        if n["type"] == "search":
            assert n["place"] in places, f"{n['id']}: unknown place {n['place']}"
        if n["type"] == "talk":
            assert n["person"] in people, f"{n['id']}: unknown person {n['person']}"
            for tp in n["topics"]:
                assert "show" not in tp or nodes.get(tp["show"], {}).get("type") == "evidence", f"{n['id']}: show must name evidence"
                for sp, _ in tp["lines"]:
                    assert sp in (0, -1, n["person"]), f"{n['id']}: speaker {sp} not in talk"
        if n["type"] == "puzzle" and n["kind"] == "game":
            assert n.get("game"), f"{n['id']}: game puzzle without game id"
    seen = {}
    for s in scenes:
        slot = (s["moment"], s["place"])
        assert slot not in seen, f"two reconstructions at {slot}: {seen[slot]} and {s['id']}"
        seen[slot] = s["id"]
        assert s["moment"] in moments and s["place"] in places, f"{s['id']}: unknown moment or place"
        for p in s["people"]:
            assert p in people, f"{s['id']}: unknown person {p}"
        for sp, _ in s["lines"]:
            assert sp == 0 or sp in s["people"], f"{s['id']}: speaker {sp} not present"
    for item in [*nodes.values(), *scenes]:
        for u in unlocks_of(item):
            for x in u.get("nodes", []): assert x in nodes, f"{item['id']}: unknown node {x}"
            for x in u.get("places", []): assert x in places, f"{item['id']}: unknown place {x}"
            for x in u.get("moments", []): assert x in moments, f"{item['id']}: unknown moment {x}"
            for x in u.get("people", []): assert x in people, f"{item['id']}: unknown person {x}"
    for x in meta["start"]:
        assert x in nodes, f"start: unknown node {x}"

    # Reachability fixpoint: everything held is used as soon as its requirements are met
    held, done, reach, known = set(meta["start"]), set(), set(), set()
    places_on = {p["id"] for p in meta["places"] if not p.get("locked")}
    moments_on = {m["id"] for m in meta["moments"] if not m.get("locked")}

    def apply(u):
        held.update(u.get("nodes", [])); known.update(u.get("people", []))
        places_on.update(u.get("places", [])); moments_on.update(u.get("moments", []))

    changed = True
    while changed:
        changed = False
        for nid in list(held):
            n = nodes[nid]
            if n["type"] == "talk":
                known.add(n["person"])
                for i, tp in enumerate(n["topics"]):
                    if (nid, i) not in done and (not tp.get("show") or tp["show"] in held):
                        done.add((nid, i)); apply(tp.get("unlock", {})); changed = True
            elif nid not in done and (n["type"] != "search" or n["place"] in places_on):
                done.add(nid); [apply(u) for u in unlocks_of(n)]; changed = True
        for s in scenes:
            if s["id"] not in reach and s["moment"] in moments_on and s["place"] in places_on and set(s["people"]) <= known:
                reach.add(s["id"]); known.update(s["people"]); apply(s.get("unlock", {})); changed = True
    lost_nodes = [n for n in nodes if n not in held]
    lost_search = [n for n in nodes if nodes[n]["type"] == "search" and nodes[n]["place"] not in places_on]
    lost_topics = [f"{n}#{i}" for n, x in nodes.items() if x["type"] == "talk" for i in range(len(x["topics"])) if (n, i) not in done]
    lost_scenes = [s["id"] for s in scenes if s["id"] not in reach]
    assert not (lost_nodes or lost_search or lost_topics or lost_scenes), \
        f"unreachable: nodes {lost_nodes} searches {lost_search} topics {lost_topics} reconstructions {lost_scenes}"

    # Encryption. Node keys derive from a secret salt kept in the private story repo, so a rebuild
    # (text fixes) keeps the same keys and players' saves stay valid
    salt_file = root / ".build_salt"
    if not salt_file.exists():
        salt_file.write_text(os.urandom(32).hex())
    salt = bytes.fromhex(salt_file.read_text().strip())
    nkeys = {nid: sha(salt + b"node|" + nid.encode()) for nid in nodes}

    def public_unlock(u):
        u = dict(u or {})
        if "nodes" in u:
            u["nodes"] = [nkeys[x].hex() for x in u["nodes"]]
        return u

    out_nodes, answers = {}, {}
    for nid, n in nodes.items():
        body = {k: v for k, v in n.items() if k not in ("answer", "reward")}
        if n["type"] == "search":
            body["objects"] = [{**o, "unlock": public_unlock(o.get("unlock"))} for o in n["objects"]]
        elif n["type"] == "talk":
            body["topics"] = [{**tp, "unlock": public_unlock(tp.get("unlock"))} for tp in n["topics"]]
        elif n["type"] == "chapter":
            body["unlock"] = public_unlock(n.get("unlock"))
        elif n["type"] == "puzzle":
            k = key("puz", [nid, "win" if n["kind"] == "game" else norm(n["answer"])])
            answers[ident(k)] = encrypt(k, {"text": n["reward"].get("text", ""), "unlock": public_unlock(n["reward"].get("unlock"))})
        out_nodes[ident(nkeys[nid])] = encrypt(nkeys[nid], body)

    out_scenes, hints = {}, {}
    for s in scenes:
        k = scene_key(s)
        payload = {k2: s[k2] for k2 in ("id", "title", "moment", "place", "people", "lines") if k2 in s}
        payload["unlock"] = public_unlock(s.get("unlock"))
        out_scenes[ident(k)] = encrypt(k, payload)
        hints[sha(f"hint|{s['moment']}|{s['place']}".encode()).hex()[:16]] = len(s["people"])

    fin = meta["final"]
    kf = key("fin", fin["answer"])
    story = {
        "title": meta["title"], "intro": meta["intro"], "moments": meta["moments"], "places": meta["places"],
        "fields": fields, "people": {p: {k: v for k, v in x.items() if k in ("aka", "look")} for p, x in people.items()},
        "who": sorted(sha(("who|%d|" % p + "|".join(map(str, v["sheet"]))).encode()).hex()[:16] for p, v in people.items()),
        "start": [nkeys[x].hex() for x in meta["start"]],
        "nodes": out_nodes, "scenes": out_scenes, "hints": hints, "answers": answers,
        "final": {"text": fin["text"], "options": fin["options"], "ending": {ident(kf): encrypt(kf, fin["ending"])}},
    }
    Path(out).write_text("// Generated by tools/build_story.py: do not edit\nwindow.STORY = "
                         + json.dumps(story, ensure_ascii=False, separators=(",", ":")) + ";\n")
    count = lambda t: sum(n["type"] == t for n in nodes.values())
    print(f"{count('chapter')} chapters, {count('search')} searches, {count('talk')} talks, {count('evidence')} evidence, "
          f"{count('puzzle')} puzzles, {len(scenes)} reconstructions, {len(people)} people -> {out}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
