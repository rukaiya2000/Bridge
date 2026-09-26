# Eval data

Synthetic only. Never real people's data.

- `conversations.jsonl`, `arcs.jsonl`: written by `uv run python -m eval.generate`. Format in `docs/PHASE1.md` §6.2.
- `heldout_gold.csv`: hand labels from `uv run python -m eval.hand_label`.
- `labels_cache.jsonl`: git-ignored labeler cache.

## Hand-check log

| Date | Who | Items reviewed | Changed | Dropped |
|---|---|---|---|---|
