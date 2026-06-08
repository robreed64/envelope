"""add household_invites table

Revision ID: k7l8m9n0o1p2
Revises: j6k7l8m9n0o1
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'k7l8m9n0o1p2'
down_revision = 'j6k7l8m9n0o1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'household_invites',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('households.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('invited_email', sa.String(255), nullable=True),
        sa.Column('token', sa.String(64), nullable=False),
        sa.Column('role', sa.String(20), nullable=False, server_default='viewer'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('accepted_by_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )
    op.create_index('ix_household_invites_token', 'household_invites', ['token'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_household_invites_token', 'household_invites')
    op.drop_table('household_invites')
