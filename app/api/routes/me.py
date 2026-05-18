import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/me", tags=["me"])


class UserProfile(BaseModel):
    id: uuid.UUID
    email: str
    wizard_completed: bool
    wizard_skipped: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class UserProfileUpdate(BaseModel):
    wizard_completed: bool | None = None
    wizard_skipped: bool | None = None


@router.get("", response_model=UserProfile)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("", response_model=UserProfile)
def update_me(
    body: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.wizard_completed is not None:
        current_user.wizard_completed = body.wizard_completed
    if body.wizard_skipped is not None:
        current_user.wizard_skipped = body.wizard_skipped
    db.commit()
    db.refresh(current_user)
    return current_user
