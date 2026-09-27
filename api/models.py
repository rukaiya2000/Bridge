"""Sync payload: aggregates only (desc.md, Data handling). `extra="forbid"` rejects any field we
didn't define, so message text can't slip in by accident."""

from datetime import date, timedelta
from typing import Literal, get_args

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
    count: int = Field(ge=0, le=1000)  # one teen can't mention a topic 1000+ times in one hour


# Kinds of personal info the extension's privacy guard catches (extension/src/privacy/detect.ts), plus
# "unsafe": a message the Jev safety gate blocked. Never its category, so abuse can't reach a parent.
Finding = Literal[
    "phone", "email", "ssn", "card", "bank", "address", "password", "birthday", "student_id", "id_document",
    "unsafe",
]


class VoiceSession(Strict):
    """One microphone use on an AI site (feature 8). When and how long only: audio is never read."""
    date: date
    hour: int = Field(ge=0, le=23)  # local hour the mic turned on
    site: Site
    minutes: int = Field(ge=0, le=24 * 60)


class PrivacyFlag(Strict):
    """Personal info caught before it was sent. The kinds of info only, never the values."""
    date: date
    hour: int = Field(ge=0, le=23)
    site: Site
    what: Literal["message", "file"]
    findings: list[Finding] = Field(min_length=1, max_length=len(get_args(Finding)))
    sent: bool  # True: the teen chose "send anyway"; False: held back
    hidden: bool = False  # sent with the details replaced ("send without these details"); sent stays False


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
    child_id: str = Field(min_length=1, max_length=64)
    # Random per browser install. Older extensions don't send it; they count as one "legacy" device.
    device_id: str = Field(default="legacy", min_length=1, max_length=64)
    week_start: date
    # Caps keep one oversized sync from filling the database or stalling the API. A real week has at
    # most one row per site, one per day x hour x topic, and one voice session per site per hour.
    sites: list[SiteAggregate] = Field(max_length=len(get_args(Site)))
    hourly_topics: list[HourlyTopicCount] = Field(max_length=7 * 24 * len(get_args(Topic)))
    # Older extensions don't send these.
    voice_sessions: list[VoiceSession] = Field(default_factory=list, max_length=7 * 24 * len(get_args(Site)))
    privacy_flags: list[PrivacyFlag] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def no_duplicate_rows(self) -> "SyncPayload":
        if len({s.site for s in self.sites}) != len(self.sites):
            raise ValueError("each site may appear only once")
        if len({(t.date, t.hour, t.topic) for t in self.hourly_topics}) != len(self.hourly_topics):
            raise ValueError("each date, hour and topic may appear only once")
        return self

    @model_validator(mode="after")
    def dates_inside_week(self) -> "SyncPayload":
        # A sync replaces the whole week, so rows outside it would never be cleaned up.
        end = self.week_start + timedelta(days=7)
        for t in [*self.hourly_topics, *self.voice_sessions, *self.privacy_flags]:
            if not self.week_start <= t.date < end:
                raise ValueError(f"date {t.date} is outside the week starting {self.week_start}")
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
    voice_sessions: list[VoiceSession]  # every device's, oldest first
    privacy_flags: list[PrivacyFlag]
