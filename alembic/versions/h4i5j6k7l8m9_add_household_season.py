"""add household season and annual income

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'h4i5j6k7l8m9'
down_revision = 'g3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('households', sa.Column('season', sa.String(20), nullable=True))
    op.add_column('households', sa.Column('annual_income', sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('households', 'annual_income')
    op.drop_column('households', 'season')
