"""add split_id to transactions

Revision ID: l8m9n0o1p2q3
Revises: k7l8m9n0o1p2
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'l8m9n0o1p2q3'
down_revision = 'k7l8m9n0o1p2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('transactions', sa.Column('split_id', UUID(as_uuid=True), nullable=True))
    op.create_index('ix_transactions_split_id', 'transactions', ['split_id'])


def downgrade():
    op.drop_index('ix_transactions_split_id', 'transactions')
    op.drop_column('transactions', 'split_id')
