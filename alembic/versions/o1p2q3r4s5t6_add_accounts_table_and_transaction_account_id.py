"""add accounts table and transaction account_id

Revision ID: o1p2q3r4s5t6
Revises: n0o1p2q3r4s5
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'o1p2q3r4s5t6'
down_revision = 'n0o1p2q3r4s5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('household_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('households.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bank_name', sa.String(100), nullable=False),
        sa.Column('account_id', sa.String(50), nullable=True),
        sa.Column('account_type', sa.String(20), nullable=True),
        sa.Column('fid', sa.String(50), nullable=True),
        sa.Column('display_name', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_accounts_household_id', 'accounts', ['household_id'])

    op.add_column('transactions', sa.Column('account_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_transactions_account_id', 'transactions', 'accounts', ['account_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_transactions_account_id', 'transactions', ['account_id'])


def downgrade():
    op.drop_index('ix_transactions_account_id', 'transactions')
    op.drop_constraint('fk_transactions_account_id', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'account_id')
    op.drop_index('ix_accounts_household_id', 'accounts')
    op.drop_table('accounts')
