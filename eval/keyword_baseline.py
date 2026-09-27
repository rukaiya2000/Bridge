"""Keyword-filter baseline: a public-style blocklist, not tuned to our data."""

import re

from eval import config


def load_keywords() -> dict[str, re.Pattern]:
    by_cat: dict[str, list[str]] = {}
    for line in config.KEYWORDS.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            cat, term = line.split("\t", 1)
            by_cat.setdefault(cat, []).append(re.escape(term.strip().lower()))
    return {cat: re.compile(r"\b(?:" + "|".join(terms) + r")\b") for cat, terms in by_cat.items()}


def level_for_texts(texts: list[str], kw: dict[str, re.Pattern]) -> str:
    joined = "\n".join(texts).lower()
    if kw["self_harm"].search(joined):
        return "crisis"
    if kw["explicit"].search(joined):
        return "concerning"
    return "healthy"


def score_conversation(conv: dict, kw: dict[str, re.Pattern]) -> str:
    return level_for_texts([t["text"] for t in conv["turns"]], kw)


def score_arc(arc: dict, kw: dict[str, re.Pattern]) -> list[str]:
    """Cumulative per-day levels: once flagged, stays flagged."""
    by_day: dict[int, list[str]] = {}
    for s in arc["sessions"]:
        for t in s["turns"]:
            by_day.setdefault((t["ts"] - config.BASE_TS) // config.DAY_MS, []).append(t["text"])
    first, last = min(by_day), max(by_day)
    levels, worst = [], 0
    for d in range(first, last + 1):
        worst = max(worst, config.LEVELS.index(level_for_texts(by_day.get(d, []), kw)))
        levels.append(config.LEVELS[worst])
    return levels
