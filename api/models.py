"""Sync payload: aggregates only (desc.md, Data handling). `extra="forbid"` rejects any field we
didn't define, so message text can't slip in by accident."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Site = Literal["chatgpt", "claude", "characterai", "gemini"]
Level = Literal["healthy", "watch", "concerning", "crisis"]
# Parent-visible topics only. Excluded topics are dropped in the extension's aggregator before sync.
Topic = Literal[
    "loneliness", "sadness", "stress", "anxiety", "anger", "self_worth",
    "school", "friends", "family", "romance", "body_image", "boredom", "other",
]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HourlyTopicCount(Strict):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    hour: int = Field(ge=0, le=23)
    topic: Topic
    count: int = Field(ge=0)


class SiteAggregate(Strict):
    site: Site
    level: Level          # already abuse-masked by the aggregator
    score: float
    active_minutes: int = Field(ge=0)
    late_night_sessions: int = Field(ge=0)
    voice_minutes: int = Field(ge=0, default=0)  # feature 8
    nudges_shown: int = Field(ge=0)
    paid_tier: bool | None = None


class SyncPayload(Strict):
    child_id: str
    week_start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    sites: list[SiteAggregate]
    hourly_topics: list[HourlyTopicCount]
