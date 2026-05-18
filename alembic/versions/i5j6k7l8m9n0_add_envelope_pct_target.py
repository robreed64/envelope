"""add income_pct_target to envelopes

Revision ID: i5j6k7l8m9n0
Revises: h4i5j6k7l8m9
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'i5j6k7l8m9n0'
down_revision = 'h4i5j6k7l8m9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('envelopes', sa.Column('income_pct_target', sa.Numeric(5, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('envelopes', 'income_pct_target')
