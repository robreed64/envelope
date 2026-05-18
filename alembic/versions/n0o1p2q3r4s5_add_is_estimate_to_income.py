"""add is_estimate to income

Revision ID: n0o1p2q3r4s5
Revises: m9n0o1p2q3r4
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = 'n0o1p2q3r4s5'
down_revision = 'm9n0o1p2q3r4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('income', sa.Column('is_estimate', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('income', 'is_estimate')
