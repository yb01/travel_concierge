"""FastAPI app entrypoint for Travel Concierge REST APIs."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from travel_concierge.api.routers.admin import router as admin_router
from travel_concierge.api.routers.user import router as user_router
from travel_concierge.api.schemas import ApiInfoResponse, HealthResponse
from travel_concierge.database.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize required resources once when the app starts."""
    init_db()
    yield


app = FastAPI(
    title="Travel Concierge API",
    version="1.0.0",
    description=(
        "REST APIs for traveler chat sessions with ADK agents and "
        "read-only admin operational views."
    ),
    lifespan=lifespan,
)

app.include_router(user_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="travel-concierge-api")


@app.get("/api/v1/info", response_model=ApiInfoResponse, tags=["system"])
def info() -> ApiInfoResponse:
    return ApiInfoResponse(
        service="travel-concierge-api",
        version="1.0.0",
        user_routes_prefix="/api/v1/user",
        admin_routes_prefix="/api/v1/admin",
    )
