"""Runs the three systems on one split and prints the comparison table.

    uv run python -m eval.run --split tuning [--rules-only]

The held-out split is run ONCE, after tuning is done (PHASE1.md §6.7).
"""

import argparse
import csv
import json
from collections import Counter
from datetime import datetime

from eval import config, core_bridge, keyword_baseline, metrics
from eval.io import read_jsonl

SYSTEMS = ["Pattern engine", "Per-message", "Keyword filter"]


def heldout_gold() -> dict[str, dict]:
    """Majority vote per id from heldout_gold.csv."""
    votes: dict[str, list[dict]] = {}
    if config.HELDOUT_GOLD.exists():
        with config.HELDOUT_GOLD.open() as f:
            for row in csv.DictReader(f):
                votes.setdefault(row["id"], []).append(row)
    out = {}
    for i, rows in votes.items():
        gold = Counter(r["gold"] for r in rows).most_common(1)[0][0]
        days = Counter(r["first_concerning_day"] or None for r in rows).most_common(1)[0][0]
        out[i] = {"gold": gold, "first_day": int(days) if days else None}
    return out


def to_labeled_arc(item_id: str, site: str, sessions: list[dict], labels: dict[str, dict]) -> dict:
    """Replaces text with labels, keyed the same way as core_bridge.pair_turns."""
    out = []
    for s_i, s in enumerate(sessions):
        turns = []
        for pair in core_bridge.pair_turns(f"{item_id}~{s_i}", site, s["turns"]):
            turns.append({"ts": pair["user"]["ts"], "labels": labels[pair["key"]]})
        out.append({"start": s["start"], "end": s["end"], "turns": turns})
    return {"id": item_id, "site": site, "sessions": out}


def as_sessions(conv: dict) -> list[dict]:
    ts = [t["ts"] for t in conv["turns"]]
    return [{"start": min(ts), "end": max(ts), "turns": conv["turns"]}]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=["tuning", "heldout"], required=True)
    ap.add_argument("--rules-only", action="store_true")
    args = ap.parse_args()

    convs = [c for c in read_jsonl(config.CONVERSATIONS) if c["split"] == args.split]
    arcs = [a for a in read_jsonl(config.ARCS) if a["split"] == args.split]
    if not convs and not arcs:
        raise SystemExit(f"No {args.split} data yet. Run `uv run python -m eval.generate` first.")

    gold_override = heldout_gold() if args.split == "heldout" else {}
    items = [(c["id"], c["site"], as_sessions(c)) for c in convs] + [(a["id"], a["site"], a["sessions"]) for a in arcs]

    pairs = [p for i, site, sessions in items for s_i, s in enumerate(sessions)
             for p in core_bridge.pair_turns(f"{i}~{s_i}", site, s["turns"])]
    labels = core_bridge.label_all(pairs, rules_only=args.rules_only)
    labeled = [to_labeled_arc(i, site, sessions, labels) for i, site, sessions in items]

    kw = keyword_baseline.load_keywords()
    per_system = {
        "Pattern engine": core_bridge.score(labeled, "pattern"),
        "Per-message": core_bridge.score(labeled, "single"),
        "Keyword filter": [{"levels_by_day": keyword_baseline.score_arc({"sessions": s}, kw)} for _, _, s in items],
    }

    conv_gold = [gold_override.get(c["id"], {}).get("gold", c["gold"]) for c in convs]
    arc_first = [gold_override.get(a["id"], {}).get("first_day", a["gold_first_concerning_day"]) for a in arcs]
    n = len(convs)

    rows, confusions = [], {}
    for name in SYSTEMS:
        res = per_system[name]
        conv_pred = [r["levels_by_day"][-1] for r in res[:n]]
        arc_pred = [r["levels_by_day"] for r in res[n:]]
        row = {
            "system": name,
            "crisis_recall": metrics.crisis_recall(conv_gold, conv_pred),
            "concerning_precision": metrics.concerning_precision(conv_gold, conv_pred),
            "healthy_fpr": metrics.healthy_fpr(conv_gold, conv_pred),
            **metrics.arc_metrics(arc_first, arc_pred),
        }
        rows.append(row)
        confusions[name] = metrics.confusion(conv_gold, conv_pred)

    fmt = lambda v: "–" if v is None else (f"{v:.2f}" if isinstance(v, float) else str(v))
    cols = list(rows[0].keys())
    print("| " + " | ".join(cols) + " |")
    print("|" + "---|" * len(cols))
    for r in rows:
        print("| " + " | ".join(fmt(r[c]) for c in cols) + " |")
    for name, m in confusions.items():
        print(f"\n{name} (rows = gold, cols = predicted: {', '.join(config.LEVELS)})")
        for lvl, line in zip(config.LEVELS, m):
            print(f"  {lvl:<11}" + " ".join(f"{x:>4}" for x in line))

    config.RESULTS.mkdir(parents=True, exist_ok=True)
    out = config.RESULTS / f"{args.split}-{datetime.now():%Y%m%d-%H%M}.json"
    out.write_text(json.dumps({
        "split": args.split, "rules_only": args.rules_only, "labeler_model": config.LABELER_MODEL,
        "counts": {"conversations": len(convs), "arcs": len(arcs)},
        "metrics": rows, "confusion": confusions,
        "predictions": {name: [{"id": i, "levels_by_day": r["levels_by_day"]} for (i, _, _), r in zip(items, res)]
                        for name, res in per_system.items()},
    }, indent=2))
    print(f"\nwrote {out.relative_to(config.ROOT)}")


if __name__ == "__main__":
    main()
