"""add funding_account_id to envelopes

Revision ID: q3r4s5t6u7v8
Revises: p2q3r4s5t6u7
Create Date: 2026-05-20
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'q3r4s5t6u7v8'
down_revision = 'p2q3r4s5t6u7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('envelopes', sa.Column(
        'funding_account_id',
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey('accounts.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('ix_envelopes_funding_account_id', 'envelopes', ['funding_account_id'])


def downgrade():
    op.drop_index('ix_envelopes_funding_account_id', table_name='envelopes')
    op.drop_column('envelopes', 'funding_account_id')
