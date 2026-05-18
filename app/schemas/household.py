import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class HouseholdCreate(BaseModel):
    name: str


class HouseholdUpdate(BaseModel):
    name: Optional[str] = None
    season: Optional[str] = None
    annual_income: Optional[Decimal] = None


class HouseholdResponse(BaseModel):
    id: uuid.UUID
    name: str
    owner_id: uuid.UUID
    season: Optional[str] = None
    annual_income: Optional[Decimal] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteMemberRequest(BaseModel):
    email: str
    role: str = "viewer"


class MemberResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class RoleUpdate(BaseModel):
    role: str


class InviteCreate(BaseModel):
    role: str = "viewer"
    invited_email: Optional[str] = None


class InviteResponse(BaseModel):
    id: uuid.UUID
    token: str
    invited_email: Optional[str] = None
    role: str
    expires_at: datetime
    accepted_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class InviteInfo(BaseModel):
    household_name: str
    invited_email: Optional[str] = None
    role: str
    expires_at: datetime
    is_expired: bool
    is_accepted: bool
