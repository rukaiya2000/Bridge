"""Accounts for testers and parents: email + password, one account per family.

Everything a family syncs is stored under its account_id, so two people testing with the same
child id ("demo") never see each other's data.

  accounts   email (unique), password hash (argon2 via pwdlib)
  sessions   random bearer token -> account_id, deleted by MongoDB after SESSION_TTL

Opaque tokens in MongoDB instead of JWTs: nothing to sign or configure, and logout really logs out.
"""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

SESSION_TTL = timedelta(days=30)
hasher = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def ensure_schema(db: Database) -> None:
    db.accounts.create_index("email", unique=True)
    db.sessions.create_index("token", unique=True)
    db.sessions.create_index("created_at", expireAfterSeconds=int(SESSION_TTL.total_seconds()))


def signup(db: Database, email: str, password: str) -> str:
    try:
        result = db.accounts.insert_one({
            "email": email.lower(), "password_hash": hasher.hash(password), "created_at": datetime.now(timezone.utc),
        })
    except DuplicateKeyError:
        raise HTTPException(409, "an account with that email already exists")
    return _new_session(db, str(result.inserted_id))


def login(db: Database, email: str, password: str) -> str:
    account = db.accounts.find_one({"email": email.lower()})
    # Hash even when the account is missing, so response time doesn't reveal which emails exist.
    ok, _ = hasher.verify_and_update(password, account["password_hash"] if account else _DUMMY_HASH)
    if not account or not ok:
        raise HTTPException(401, "wrong email or password")
    return _new_session(db, str(account["_id"]))


def extra_session(db: Database, account_id: str) -> str:
    """A second login for the same account, so the extension can log out separately from the dashboard."""
    return _new_session(db, account_id)


def logout(db: Database, token: str) -> None:
    db.sessions.delete_one({"token": token})


def _new_session(db: Database, account_id: str) -> str:
    token = secrets.token_urlsafe(32)
    db.sessions.insert_one({"token": token, "account_id": account_id, "created_at": datetime.now(timezone.utc)})
    return token


_DUMMY_HASH = hasher.hash("not a real password")


class Session:
    def __init__(self, token: str, account_id: str):
        self.token = token
        self.account_id = account_id


def current_session(
    request: Request, creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]
) -> Session:
    """FastAPI dependency: the logged-in account, or 401."""
    found = creds and request.app.state.db.sessions.find_one({"token": creds.credentials})
    if not found:
        raise HTTPException(401, "log in first", headers={"WWW-Authenticate": "Bearer"})
    return Session(found["token"], found["account_id"])


CurrentSession = Annotated[Session, Depends(current_session)]
