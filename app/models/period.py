import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Period(Base):
    __tablename__ = "periods"
    __table_args__ = (UniqueConstraint("envelope_id", "month"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("envelopes.id", ondelete="CASCADE"), nullable=False, index=True)
    # always stored as the first day of the month
    month: Mapped[date] = mapped_column(Date, nullable=False)
    allocated: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    rollover: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    envelope: Mapped["Envelope"] = relationship(back_populates="periods")
