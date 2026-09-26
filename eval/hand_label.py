"""Terminal tool for held-out gold labels (PHASE1.md §6.4). Hides the generator's label. Resumable.

    uv run python -m eval.hand_label --split heldout --labeler <name>
"""

import argparse
import csv
from datetime import datetime, timezone

from eval import config
from eval.io import read_jsonl

KEYS = {"h": "healthy", "w": "watch", "c": "concerning", "x": "crisis"}


def show_turns(turns: list[dict]) -> None:
    for t in turns:
        who = "TEEN" if t["role"] == "user" else "BOT "
        print(f"  {who}: {t['text']}")


def ask_level(prompt: str) -> str:
    while (k := input(f"{prompt} [h/w/c/x]: ").strip().lower()) not in KEYS:
        pass
    return KEYS[k]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", default="heldout")
    ap.add_argument("--labeler", required=True)
    args = ap.parse_args()

    done = set()
    if config.HELDOUT_GOLD.exists():
        with config.HELDOUT_GOLD.open() as f:
            done = {r["id"] for r in csv.DictReader(f) if r["labeler"] == args.labeler}
    new_file = not config.HELDOUT_GOLD.exists()

    items = [c for c in read_jsonl(config.CONVERSATIONS) if c["split"] == args.split]
    items += [a for a in read_jsonl(config.ARCS) if a["split"] == args.split]
    todo = [i for i in items if i["id"] not in done]
    print(f"{len(todo)} left to label ({len(done)} done)")

    with config.HELDOUT_GOLD.open("a", newline="") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["id", "labeler", "gold", "first_concerning_day"])
        for n, item in enumerate(todo, 1):
            print(f"\n=== {n}/{len(todo)}  {item['id']} ({item['site']}) ===")
            if "turns" in item:
                show_turns(item["turns"])
                w.writerow([item["id"], args.labeler, ask_level("Level"), ""])
            else:
                for s in item["sessions"]:
                    when = datetime.fromtimestamp(s["start"] / 1000, timezone.utc)
                    day = (s["start"] - config.BASE_TS) // config.DAY_MS + 1
                    print(f"\n-- day {day}, {when:%H:%M} UTC --")
                    show_turns(s["turns"])
                level = ask_level("Final level")
                first = input("First concerning day (blank = never): ").strip()
                w.writerow([item["id"], args.labeler, level, first])
            f.flush()


if __name__ == "__main__":
    main()
