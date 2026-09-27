"""Paths, model names and constants for the eval. Loads the API keys from the repo's .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

# Jev on OpenRouter labels turns (via the core CLI). UF Navigator (OpenAI-compatible) generates the dataset.
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
LABELER_MODEL = "typesafe/jev-1.13"   # must match JEV_MODEL in core/src/config.ts
NAVIGATOR_API_KEY = os.environ.get("NAVIGATOR_API_KEY", "")
NAVIGATOR_BASE_URL = "https://api.navigator.ai.ufl.edu/v1"
GENERATOR_MODEL = "llama-3.3-70b-instruct"  # a different model family on purpose

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
