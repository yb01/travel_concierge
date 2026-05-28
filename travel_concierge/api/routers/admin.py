"""Admin API endpoints for operational visibility and controls."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from travel_concierge.api.dependencies import get_db, require_admin_api_key
from travel_concierge.api.schemas import (
    BookingResponse,
    GuestSummary,
    PaymentSummaryResponse,
)
from travel_concierge.database.models import Booking, BookingStatus, Guest, PaymentStatus

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_api_key)],
)


def _booking_to_response(booking: Booking) -> BookingResponse:
    return BookingResponse(
        booking_id=booking.booking_id,
        guest_id=booking.guest_id,
        hotel_id=booking.hotel_id,
        room_id=booking.room_id,
        check_in_date=booking.check_in_date.date(),
        check_out_date=booking.check_out_date.date(),
        num_nights=booking.num_nights,
        total_price_usd=float(booking.total_price_usd),
        status=booking.status.value,
        payment_status=booking.payment_status.value,
        payment_method=booking.payment_method,
        notes=booking.notes,
    )


@router.get("/guests", response_model=list[GuestSummary])
def list_guests(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[GuestSummary]:
    guests = db.execute(
        select(Guest)
        .order_by(Guest.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).scalars().all()

    return [
        GuestSummary(
            guest_id=g.guest_id,
            first_name=g.first_name,
            last_name=g.last_name,
            email=g.email,
            phone=g.phone,
        )
        for g in guests
    ]


@router.get("/guests/{guest_id}/bookings", response_model=list[BookingResponse])
def list_guest_bookings(guest_id: str, db: Session = Depends(get_db)) -> list[BookingResponse]:
    bookings = db.execute(
        select(Booking)
        .where(Booking.guest_id == guest_id)
        .order_by(Booking.created_at.desc())
    ).scalars().all()
    return [_booking_to_response(b) for b in bookings]


@router.get("/bookings", response_model=list[BookingResponse])
def list_all_bookings(
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    payment_status_filter: PaymentStatus | None = Query(default=None, alias="payment_status"),
    db: Session = Depends(get_db),
) -> list[BookingResponse]:
    stmt = select(Booking).order_by(Booking.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(Booking.status == status_filter)
    if payment_status_filter is not None:
        stmt = stmt.where(Booking.payment_status == payment_status_filter)

    bookings = db.execute(stmt).scalars().all()
    return [_booking_to_response(b) for b in bookings]


@router.get("/bookings/{booking_id}", response_model=BookingResponse)
def get_booking(booking_id: str, db: Session = Depends(get_db)) -> BookingResponse:
    booking = db.execute(select(Booking).where(Booking.booking_id == booking_id)).scalar_one_or_none()
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return _booking_to_response(booking)


@router.get("/payments/summary", response_model=PaymentSummaryResponse)
def get_payments_summary(db: Session = Depends(get_db)) -> PaymentSummaryResponse:
    total_bookings = db.execute(select(func.count(Booking.booking_id))).scalar_one()

    paid_total = db.execute(
        select(func.coalesce(func.sum(Booking.total_price_usd), 0)).where(
            Booking.payment_status == PaymentStatus.PAID
        )
    ).scalar_one()

    refunded_total = db.execute(
        select(func.coalesce(func.sum(Booking.total_price_usd), 0)).where(
            Booking.payment_status == PaymentStatus.REFUNDED
        )
    ).scalar_one()

    pending_count = db.execute(
        select(func.count(Booking.booking_id)).where(
            Booking.payment_status == PaymentStatus.PENDING
        )
    ).scalar_one()

    failed_count = db.execute(
        select(func.count(Booking.booking_id)).where(
            Booking.payment_status == PaymentStatus.FAILED
        )
    ).scalar_one()

    return PaymentSummaryResponse(
        total_bookings=total_bookings,
        total_paid_usd=float(paid_total),
        total_refunded_usd=float(refunded_total),
        pending_payments=pending_count,
        failed_payments=failed_count,
    )
