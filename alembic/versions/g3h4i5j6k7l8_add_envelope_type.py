"""add envelope type

Revision ID: g3h4i5j6k7l8
Revises: f2a3b4c5d6e7
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'g3h4i5j6k7l8'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('envelopes', sa.Column('envelope_type', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('envelopes', 'envelope_type')
