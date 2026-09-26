"""Paths, model names and constants for the eval. Loads GEMINI_API_KEY from the repo's .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
LABELER_MODEL = "gemini-3.8-flash"   # must match core/src/config.ts
GENERATOR_MODEL = "gemini-3-flash-preview"  # a different model on purpose; Pro models need a paid quota

DATA = ROOT / "eval" / "data"
RESULTS = ROOT / "eval" / "results"
CONVERSATIONS = DATA / "conversations.jsonl"
ARCS = DATA / "arcs.jsonl"
HELDOUT_GOLD = DATA / "heldout_gold.csv"
LABELS_CACHE = DATA / "labels_cache.jsonl"
KEYWORDS = ROOT / "eval" / "keywords.tsv"
CORE_CLI = ROOT / "core" / "dist" / "cli.js"

BASE_TS = 1788220800000  # day 1 = 2026-09-01 00:00 UTC
DAY_MS = 86_400_000
LEVELS = ["healthy", "watch", "concerning", "crisis"]
