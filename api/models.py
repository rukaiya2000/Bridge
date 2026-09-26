"""Sync payload: aggregates only (desc.md, Data handling). `extra="forbid"` rejects any field we
didn't define, so message text can't slip in by accident."""

from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

Site = Literal["chatgpt", "claude", "characterai", "gemini"]
Level = Literal["healthy", "watch", "concerning", "crisis"]
# Parent-visible topics only (same list as TOPICS in core/src/types.ts). Excluded topics are dropped in
# the extension's aggregator before sync.
Topic = Literal[
    "loneliness", "sadness", "stress", "anxiety", "anger", "self_worth",
    "hopelessness", "emptiness", "rejection", "guilt_shame", "overwhelm", "fear", "grief", "jealousy", "frustration",
    "happiness",
    "school", "friends", "family", "romance", "body_image", "boredom", "other",
]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class HourlyTopicCount(Strict):
    date: date
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
    privacy_pauses: int = Field(ge=0, default=0)  # times personal info was caught before sending
    paid_tier: bool | None = None


class SyncPayload(Strict):
    """One device's week. Several devices (browsers) can report for the same child_id."""
    child_id: str
    # Random per browser install. Older extensions don't send it; they count as one "legacy" device.
    device_id: str = Field(default="legacy", min_length=1, max_length=64)
    week_start: date
    sites: list[SiteAggregate]
    hourly_topics: list[HourlyTopicCount]

    @model_validator(mode="after")
    def topics_inside_week(self) -> "SyncPayload":
        # A sync replaces the whole week, so counts outside it would never be cleaned up.
        end = self.week_start + timedelta(days=7)
        for t in self.hourly_topics:
            if not self.week_start <= t.date < end:
                raise ValueError(f"hourly topic date {t.date} is outside the week starting {self.week_start}")
        return self


class TopicTrend(Strict):
    """Per-topic counts for one week vs the week before (computed by a MongoDB aggregation)."""
    topic: Topic
    this_week: int
    last_week: int
    late_night: int  # this week's count between 23:00 and 04:59


class ToolRating(Strict):
    """Hand-curated rating for one AI site (desc.md feature 6). Stored in MongoDB, never generated."""
    site: Site
    name: str
    type: Literal["general_assistant", "companion"]
    min_age: int
    teen_safety_settings: bool
    summary: str
    recommendation: str


class Starter(Strict):
    """Vetted conversation starter (desc.md feature 2). `topic` is a Topic or "default"."""
    topic: Topic | Literal["default"]
    text: str


class Credentials(Strict):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginResult(Strict):
    token: str  # send as "Authorization: Bearer <token>"
    email: str


class Me(Strict):
    email: str


class WeekSummary(Strict):
    """A child's week as the parent sees it: every device added up (api/db.py load_week)."""
    child_id: str
    week_start: date
    devices: int
    sites: list[SiteAggregate]
    hourly_topics: list[HourlyTopicCount]
