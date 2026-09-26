"""Metric definitions from PHASE1.md §6.7. Inputs are ids and levels only, never text."""

from statistics import median

from eval.config import LEVELS

RANK = {lvl: i for i, lvl in enumerate(LEVELS)}


def crisis_recall(gold: list[str], pred: list[str]) -> float | None:
    idx = [i for i, g in enumerate(gold) if g == "crisis"]
    return sum(pred[i] == "crisis" for i in idx) / len(idx) if idx else None


def concerning_precision(gold: list[str], pred: list[str]) -> float | None:
    idx = [i for i, p in enumerate(pred) if p == "concerning"]
    return sum(gold[i] in ("concerning", "crisis") for i in idx) / len(idx) if idx else None


def healthy_fpr(gold: list[str], pred: list[str]) -> float | None:
    idx = [i for i, g in enumerate(gold) if g == "healthy"]
    return sum(RANK[pred[i]] >= RANK["watch"] for i in idx) / len(idx) if idx else None


def first_concerning_day(levels_by_day: list[str]) -> int | None:
    for day, lvl in enumerate(levels_by_day, start=1):
        if RANK[lvl] >= RANK["concerning"]:
            return day
    return None


def arc_metrics(gold_first_days: list[int | None], pred_levels: list[list[str]]) -> dict:
    """Detection rate, median days-to-detection and early flags over arcs."""
    should = [(g, first_concerning_day(p)) for g, p in zip(gold_first_days, pred_levels) if g is not None]
    detected = [p for _, p in should if p is not None]
    return {
        "arc_detection_rate": len(detected) / len(should) if should else None,
        "median_days_to_detection": median(detected) if detected else None,
        "early_flags": sum(1 for g, p in zip(gold_first_days, pred_levels)
                           if (fd := first_concerning_day(p)) is not None and (g is None or fd < g)),
    }


def confusion(gold: list[str], pred: list[str]) -> list[list[int]]:
    m = [[0] * len(LEVELS) for _ in LEVELS]
    for g, p in zip(gold, pred):
        m[RANK[g]][RANK[p]] += 1
    return m
