from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.household import Household, HouseholdMember
from app.models.household_invite import HouseholdInvite
from app.models.user import User
from app.schemas.household import InviteInfo, MemberResponse

router = APIRouter(prefix="/invites", tags=["invites"])


@router.get("/{token}", response_model=InviteInfo)
def get_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(HouseholdInvite).filter_by(token=token).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    now = datetime.now(timezone.utc)
    household = db.query(Household).filter_by(id=invite.household_id).first()
    return InviteInfo(
        household_name=household.name if household else "Unknown",
        invited_email=invite.invited_email,
        role=invite.role,
        expires_at=invite.expires_at,
        is_expired=invite.expires_at < now,
        is_accepted=invite.accepted_at is not None,
    )


@router.post("/{token}/accept", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def accept_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = db.query(HouseholdInvite).filter_by(token=token).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    now = datetime.now(timezone.utc)
    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite already used")
    if invite.expires_at < now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired")

    existing = db.query(HouseholdMember).filter_by(
        household_id=invite.household_id, user_id=current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member of this household")

    member = HouseholdMember(
        household_id=invite.household_id,
        user_id=current_user.id,
        role=invite.role,
    )
    db.add(member)
    invite.accepted_at = now
    invite.accepted_by_id = current_user.id
    db.commit()
    db.refresh(member)
    return MemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=current_user.email,
        role=member.role,
        joined_at=member.joined_at,
    )
