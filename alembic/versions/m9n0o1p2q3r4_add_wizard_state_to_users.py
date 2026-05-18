"""add wizard state to users

Revision ID: m9n0o1p2q3r4
Revises: l8m9n0o1p2q3
Create Date: 2026-05-16

"""
from alembic import op
import sqlalchemy as sa

revision = 'm9n0o1p2q3r4'
down_revision = 'l8m9n0o1p2q3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('wizard_completed', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('wizard_skipped', sa.Boolean(), nullable=False, server_default='false'))


def downgrade():
    op.drop_column('users', 'wizard_skipped')
    op.drop_column('users', 'wizard_completed')
