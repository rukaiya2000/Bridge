import os
import platform

import pytest
from fastapi.testclient import TestClient

# pymongo-inmemory downloads and runs a real mongod (no Docker). Its auto-detection picks the old
# Intel macOS build, so point it at the Apple Silicon one. Override with PYMONGOIM__* env vars.
if platform.system() == "Darwin" and platform.machine() == "arm64":
    os.environ.setdefault("PYMONGOIM__OPERATING_SYSTEM", "macos")
    os.environ.setdefault("PYMONGOIM__OS_VERSION", "arm")
os.environ.setdefault("PYMONGOIM__MONGO_VERSION", "8.0")

from pymongo_inmemory import Mongod  # noqa: E402
from pymongo_inmemory.context import Context  # noqa: E402

from api.main import app  # noqa: E402


@pytest.fixture(scope="session")
def mongo_uri():
    """A throwaway MongoDB for the whole test run. First run downloads mongod (~100 MB, cached)."""
    with Mongod(Context()) as mongod, pytest.MonkeyPatch.context() as mp:
        mp.setenv("MONGODB_URI", mongod.connection_string)
        mp.setenv("MONGODB_DB", "bridge_test")
        yield mongod.connection_string


@pytest.fixture
def client(mongo_uri):
    """Starts the app (runs the lifespan, so the schema exists) on an emptied database."""
    with TestClient(app) as c:
        db = app.state.db
        db.weekly_aggregates.delete_many({})
        db.hourly_topics.delete_many({})
        yield c
