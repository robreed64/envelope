"""add is_protected to envelopes

Revision ID: j6k7l8m9n0o1
Revises: i5j6k7l8m9n0
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'j6k7l8m9n0o1'
down_revision = 'i5j6k7l8m9n0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('envelopes', sa.Column('is_protected', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('envelopes', 'is_protected')
