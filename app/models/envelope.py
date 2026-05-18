import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Envelope(Base):
    __tablename__ = "envelopes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    group_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rollover: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    envelope_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    income_pct_target: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    is_protected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    household: Mapped["Household"] = relationship(back_populates="envelopes")
    periods: Mapped[list["Period"]] = relationship(back_populates="envelope", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="envelope", cascade="all, delete-orphan")
