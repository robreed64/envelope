import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_household_role
from app.core.database import get_db
from app.models.household import Household, HouseholdMember
from app.models.household_invite import HouseholdInvite
from app.models.user import User
from app.schemas.household import (
    HouseholdCreate,
    HouseholdResponse,
    HouseholdUpdate,
    InviteCreate,
    InviteMemberRequest,
    InviteResponse,
    MemberResponse,
    RoleUpdate,
)

router = APIRouter(prefix="/households", tags=["households"])


@router.post("", response_model=HouseholdResponse, status_code=status.HTTP_201_CREATED)
def create_household(
    body: HouseholdCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    household = Household(name=body.name, owner_id=current_user.id)
    db.add(household)
    db.flush()
    db.add(HouseholdMember(household_id=household.id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(household)
    return household


@router.get("", response_model=list[HouseholdResponse])
def list_households(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Household)
        .join(HouseholdMember, Household.id == HouseholdMember.household_id)
        .filter(HouseholdMember.user_id == current_user.id)
        .all()
    )


@router.patch("/{household_id}", response_model=HouseholdResponse)
def update_household(
    household_id: uuid.UUID,
    body: HouseholdUpdate,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor"])),
    db: Session = Depends(get_db),
):
    household = db.query(Household).filter_by(id=household_id).first()
    if not household:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(household, field, value)
    db.commit()
    db.refresh(household)
    return household


# ── Members ──────────────────────────────────────────────────────────────────

@router.get("/{household_id}/members", response_model=list[MemberResponse])
def list_members(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner", "editor", "viewer"])),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(HouseholdMember, User.email)
        .join(User, HouseholdMember.user_id == User.id)
        .filter(HouseholdMember.household_id == household_id)
        .all()
    )
    return [
        MemberResponse(id=m.id, user_id=m.user_id, email=email, role=m.role, joined_at=m.joined_at)
        for m, email in rows
    ]


@router.post("/{household_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def invite_member(
    household_id: uuid.UUID,
    body: InviteMemberRequest,
    _: HouseholdMember = Depends(require_household_role(["owner"])),
    db: Session = Depends(get_db),
):
    invitee = db.query(User).filter_by(email=body.email).first()
    if not invitee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    existing = db.query(HouseholdMember).filter_by(household_id=household_id, user_id=invitee.id).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already a member")
    member = HouseholdMember(household_id=household_id, user_id=invitee.id, role=body.role)
    db.add(member)
    db.commit()
    db.refresh(member)
    return MemberResponse(id=member.id, user_id=member.user_id, email=invitee.email, role=member.role, joined_at=member.joined_at)


@router.patch("/{household_id}/members/{member_id}", response_model=MemberResponse)
def update_member_role(
    household_id: uuid.UUID,
    member_id: uuid.UUID,
    body: RoleUpdate,
    acting: HouseholdMember = Depends(require_household_role(["owner"])),
    db: Session = Depends(get_db),
):
    if body.role not in ("editor", "viewer"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be editor or viewer")
    member = db.query(HouseholdMember).filter_by(id=member_id, household_id=household_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.role == "owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change owner role")
    member.role = body.role
    db.commit()
    user = db.query(User).filter_by(id=member.user_id).first()
    return MemberResponse(id=member.id, user_id=member.user_id, email=user.email, role=member.role, joined_at=member.joined_at)


@router.delete("/{household_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    household_id: uuid.UUID,
    member_id: uuid.UUID,
    acting: HouseholdMember = Depends(require_household_role(["owner"])),
    db: Session = Depends(get_db),
):
    member = db.query(HouseholdMember).filter_by(id=member_id, household_id=household_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.role == "owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove the owner")
    db.delete(member)
    db.commit()


# ── Invites ───────────────────────────────────────────────────────────────────

@router.post("/{household_id}/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    household_id: uuid.UUID,
    body: InviteCreate,
    acting: HouseholdMember = Depends(require_household_role(["owner"])),
    db: Session = Depends(get_db),
):
    if body.role not in ("editor", "viewer"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be editor or viewer")
    invite = HouseholdInvite(
        household_id=household_id,
        invited_email=body.invited_email or None,
        role=body.role,
        created_by=acting.user_id,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/{household_id}/invites", response_model=list[InviteResponse])
def list_invites(
    household_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner"])),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    return (
        db.query(HouseholdInvite)
        .filter_by(household_id=household_id)
        .filter(HouseholdInvite.accepted_at.is_(None), HouseholdInvite.expires_at > now)
        .order_by(HouseholdInvite.expires_at.desc())
        .all()
    )


@router.delete("/{household_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
    household_id: uuid.UUID,
    invite_id: uuid.UUID,
    _: HouseholdMember = Depends(require_household_role(["owner"])),
    db: Session = Depends(get_db),
):
    invite = db.query(HouseholdInvite).filter_by(id=invite_id, household_id=household_id).first()
    if not invite:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    db.delete(invite)
    db.commit()
