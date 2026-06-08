"""add_recurring_templates

Revision ID: e1a3f2b4c5d6
Revises: b344abc09eca
Create Date: 2026-05-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e1a3f2b4c5d6'
down_revision: Union[str, None] = 'b344abc09eca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'recurring_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('households.id', ondelete='CASCADE'), nullable=False),
        sa.Column('envelope_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('envelopes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=False),
        sa.Column('type', sa.String(10), nullable=False, server_default='debit'),
        sa.Column('day_of_month', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_recurring_templates_household_id', 'recurring_templates', ['household_id'])


def downgrade() -> None:
    op.drop_index('ix_recurring_templates_household_id', 'recurring_templates')
    op.drop_table('recurring_templates')
