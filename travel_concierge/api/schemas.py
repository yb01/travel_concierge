"""Pydantic schemas for Travel Concierge REST APIs."""

from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GuestSummary(BaseModel):
    guest_id: str
    first_name: str
    last_name: str
    email: str
    phone: str | None = None


class ChatSessionCreateRequest(BaseModel):
    user_id: str = Field(min_length=1)


class ChatSessionResponse(BaseModel):
    app_name: str
    user_id: str
    session_id: str


class ChatMessageRequest(BaseModel):
    user_id: str = Field(min_length=1)
    message: str = Field(min_length=1)


class ChatMessageResponse(BaseModel):
    app_name: str
    user_id: str
    session_id: str
    assistant_text: str
    events: list[dict[str, Any]]


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    booking_id: str
    guest_id: str
    hotel_id: str
    room_id: str
    check_in_date: date
    check_out_date: date
    num_nights: int
    total_price_usd: float
    status: str
    payment_status: str
    payment_method: str | None = None
    notes: str | None = None


class PaymentSummaryResponse(BaseModel):
    total_bookings: int
    total_paid_usd: float
    total_refunded_usd: float
    pending_payments: int
    failed_payments: int


class HealthResponse(BaseModel):
    status: str
    service: str


class ApiInfoResponse(BaseModel):
    service: str
    version: str
    user_routes_prefix: str
    admin_routes_prefix: str
