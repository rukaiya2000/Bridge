"""Calls the TypeScript core CLI (node core/dist/cli.js) and caches labels."""

import hashlib
import json
import os
import subprocess

from eval import config
from eval.io import read_jsonl


def _check_cli() -> None:
    if not config.CORE_CLI.exists():
        raise SystemExit("core/dist/cli.js not found: run `npm run build -w core` first")


def _run(args: list[str], lines: list[str]) -> list[dict]:
    _check_cli()
    env = {**os.environ, "OPENROUTER_API_KEY": config.OPENROUTER_API_KEY, "TZ": "UTC"}
    out = subprocess.run(
        ["node", str(config.CORE_CLI), *args],
        input="".join(line + "\n" for line in lines),
        capture_output=True, text=True, env=env, check=True,
    )
    return [json.loads(line) for line in out.stdout.splitlines() if line.strip()]


def _cache_key(user: dict, bot: dict | None) -> str:
    raw = config.LABELER_MODEL + user["text"] + (bot["text"] if bot else "")
    return hashlib.sha256(raw.encode()).hexdigest()


def pair_turns(item_id: str, site: str, turns: list[dict]) -> list[dict]:
    """Pairs each user turn with the next bot turn (or None)."""
    pairs = []
    for i, t in enumerate(turns):
        if t["role"] != "user":
            continue
        nxt = turns[i + 1] if i + 1 < len(turns) and turns[i + 1]["role"] == "bot" else None
        mk = lambda x, j: {"id": f"{item_id}:{x['role']}:{j}", "site": site, "conversationId": item_id, **x}
        pairs.append({"key": f"{item_id}#{i}", "user": mk(t, i), "bot": mk(nxt, i + 1) if nxt else None})
    return pairs


def label_all(pairs: list[dict], rules_only: bool = False) -> dict[str, dict]:
    """Returns {pair key: TurnLabels}. Only uncached pairs go to the CLI."""
    cache = {r["hash"]: r["labels"] for r in read_jsonl(config.LABELS_CACHE)} if not rules_only else {}
    todo = [p for p in pairs if _cache_key(p["user"], p["bot"]) not in cache]
    if todo:
        # Concurrency 2 keeps the free tier under its per-minute limit.
        args = ["label", "--rules-only"] if rules_only else ["label", "--concurrency", "2"]
        results = _run(args, [json.dumps(p) for p in todo])
        new_rows, fell_back = [], 0
        for p, r in zip(todo, results):
            h = _cache_key(p["user"], p["bot"])
            cache[h] = r["labels"]
            # A "rules" label here means the Jev call failed. Use it for this run but don't
            # cache it, so a rerun asks Jev again instead of freezing a degraded label.
            if not rules_only and r["labels"]["source"] == "rules":
                fell_back += 1
                continue
            new_rows.append({"hash": h, "labels": r["labels"]})
        if fell_back:
            print(f"WARNING: {fell_back}/{len(todo)} labels fell back to rules (Jev failed). Rerun to retry them.")
        if not rules_only:
            config.LABELS_CACHE.parent.mkdir(parents=True, exist_ok=True)
            with config.LABELS_CACHE.open("a") as f:
                f.writelines(json.dumps(r) + "\n" for r in new_rows)
    return {p["key"]: cache[_cache_key(p["user"], p["bot"])] for p in pairs}


def score(labeled_arcs: list[dict], mode: str) -> list[dict]:
    """mode is "pattern" or "single". Returns one result per arc, in order."""
    return _run(["score", "--mode", mode], [json.dumps(a) for a in labeled_arcs])
