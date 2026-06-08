"""add payee aliases

Revision ID: f2a3b4c5d6e7
Revises: e1a3f2b4c5d6
Create Date: 2026-05-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f2a3b4c5d6e7'
down_revision = 'e1a3f2b4c5d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'payee_aliases',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('raw', sa.String(500), nullable=False),
        sa.Column('alias', sa.String(100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['household_id'], ['households.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('household_id', 'raw', name='uq_payee_alias_household_raw'),
    )
    op.create_index('ix_payee_aliases_household_id', 'payee_aliases', ['household_id'])


def downgrade() -> None:
    op.drop_index('ix_payee_aliases_household_id', table_name='payee_aliases')
    op.drop_table('payee_aliases')
