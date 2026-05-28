"""Dependency providers for FastAPI routes."""

from collections.abc import Generator
import os

from fastapi import Header, HTTPException, status
from sqlalchemy.orm import Session

from travel_concierge.database.db import get_session


DEMO_USER_API_KEY = "demo-user-key"


def get_db() -> Generator[Session, None, None]:
    """Yield a database session with commit/rollback handled centrally."""
    with get_session() as session:
        yield session


def require_user_api_key(x_api_key: str = Header(default="")) -> None:
    """Authorize user-facing endpoints with a dedicated API key."""
    expected_key = os.getenv("TRAVEL_CONCIERGE_USER_API_KEY", DEMO_USER_API_KEY)
    if x_api_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user API key",
        )


def require_admin_api_key(x_admin_api_key: str = Header(default="")) -> None:
    """Authorize admin endpoints with a separate admin API key."""
    expected_key = os.getenv("TRAVEL_CONCIERGE_ADMIN_API_KEY", "")
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API key is not configured",
        )
    if x_admin_api_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin API key",
        )
