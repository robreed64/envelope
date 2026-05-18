"""add envelope sort_order

Revision ID: a1b2c3d4e5f6
Revises: f2a3b4c5d6e7
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f2a3b4c5d6e7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('envelopes', sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'))
    # Assign initial sort order based on creation time
    op.execute("""
        UPDATE envelopes e
        SET sort_order = sub.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY household_id ORDER BY created_at) AS rn
            FROM envelopes
        ) sub
        WHERE e.id = sub.id
    """)


def downgrade() -> None:
    op.drop_column('envelopes', 'sort_order')
