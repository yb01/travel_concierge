"""User-facing APIs that proxy chat sessions to the underlying ADK agent."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from travel_concierge.agent import root_agent
from travel_concierge.api.dependencies import require_user_api_key
from travel_concierge.api.schemas import (
    ChatMessageRequest,
    ChatMessageResponse,
    ChatSessionCreateRequest,
    ChatSessionResponse,
)

router = APIRouter(
    prefix="/user",
    tags=["user"],
    dependencies=[Depends(require_user_api_key)],
)

APP_NAME = "travel_concierge_api"
_session_service = InMemorySessionService()
_runner = Runner(agent=root_agent, session_service=_session_service, app_name=APP_NAME)


def _collect_event_text(event: Any) -> str:
    content = getattr(event, "content", None)
    if content is None or not getattr(content, "parts", None):
        return ""

    texts: list[str] = []
    for part in content.parts:
        part_text = getattr(part, "text", None)
        if part_text:
            texts.append(part_text)
    return "\n".join(texts)


def _serialize_event(event: Any) -> dict[str, Any]:
    model_dump = getattr(event, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump(mode="json", exclude_none=True)
        if isinstance(dumped, dict):
            return dumped
        return {"event": dumped}
    return {"raw": str(event)}


@router.post(
    "/sessions",
    response_model=ChatSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_chat_session(payload: ChatSessionCreateRequest) -> ChatSessionResponse:
    session = _session_service.create_session_sync(
        user_id=payload.user_id,
        app_name=APP_NAME,
    )
    return ChatSessionResponse(
        app_name=APP_NAME,
        user_id=payload.user_id,
        session_id=session.id,
    )


@router.post("/sessions/{session_id}/messages", response_model=ChatMessageResponse)
def send_message(
    session_id: str,
    payload: ChatMessageRequest,
) -> ChatMessageResponse:
    message = types.Content(
        role="user",
        parts=[types.Part.from_text(text=payload.message)],
    )

    try:
        events = list(
            _runner.run(
                new_message=message,
                user_id=payload.user_id,
                session_id=session_id,
                run_config=RunConfig(streaming_mode=StreamingMode.SSE),
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unable to run chat session: {exc}",
        ) from exc

    text_chunks: list[str] = []
    serialised_events: list[dict[str, Any]] = []
    for event in events:
        text = _collect_event_text(event)
        if text:
            text_chunks.append(text)
        serialised_events.append(_serialize_event(event))

    return ChatMessageResponse(
        app_name=APP_NAME,
        user_id=payload.user_id,
        session_id=session_id,
        assistant_text="\n".join(text_chunks).strip(),
        events=serialised_events,
    )
