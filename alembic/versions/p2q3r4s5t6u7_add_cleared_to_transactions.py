"""add cleared to transactions

Revision ID: p2q3r4s5t6u7
Revises: o1p2q3r4s5t6
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa

revision = 'p2q3r4s5t6u7'
down_revision = 'o1p2q3r4s5t6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('transactions', sa.Column('cleared', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('transactions', 'cleared')
