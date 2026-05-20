# Envelope Budget — Project Guide

## What This Is
A personal envelope-budgeting app. Backend serves a REST API and also serves the compiled frontend as a SPA. One Docker Compose stack runs everything.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 16 |
| Auth | JWT (python-jose), bcrypt, access + refresh token pattern |
| Frontend | React 18, Vite, TanStack Query v5, React Router v6, Tailwind CSS v3 |
| Charts | Recharts |
| Drag & Drop | @dnd-kit |
| Container | Docker Compose (postgres + api services) |
| CI | GitHub Actions — triggers on PR to `main` |

---

## Project Structure

```
app/
  core/        # config, database engine, security (JWT/bcrypt)
  models/      # SQLAlchemy ORM models (one file per entity)
  schemas/     # Pydantic request/response models (one file per entity)
  api/
    deps.py    # shared dependencies: get_current_user, require_household_role
    routes/    # one router file per feature area
frontend/src/
  api/         # Axios request functions (one file per feature)
  components/  # reusable UI components
  context/     # AuthContext (login/logout/token state)
  hooks.js     # custom React hooks
  pages/       # page components, one per route
  utils.js     # pure helper functions (formatting, date math, constants)
tests/         # pytest, one file per feature area
alembic/       # database migration scripts
```

---

## Commands

### Local dev (Docker)
```bash
docker compose up --build       # start postgres + api (with alembic migrate on boot)
docker compose up -d db         # start only postgres (for running backend locally)
```

### Backend (without Docker)
```bash
pip install -r requirements.txt -r requirements-test.txt
DATABASE_URL=postgresql://envelope_user:password@localhost:5433/envelope_db \
SECRET_KEY=dev-secret \
uvicorn app.main:app --reload --port 8000
```

### Alembic migrations
```bash
alembic upgrade head                          # apply all migrations
alembic revision --autogenerate -m "message"  # generate new migration from model changes
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # dev server on :5173, proxied to backend at :8000
npm run build    # output to frontend/dist/ (served by FastAPI in production)
```

### Tests
```bash
# requires a running postgres — either `docker compose up -d db` or local postgres
DATABASE_URL=postgresql://envelope_user:password@localhost:5432/envelope_test_db \
SECRET_KEY=test-secret \
pytest --tb=short
```
Test DB is separate from dev DB. `conftest.py` creates/drops all tables once per session and truncates before each test.

---

## Backend Conventions

**Models** (`app/models/`)
- Use SQLAlchemy `Mapped[]` typed columns throughout — never bare `Column()`
- UUIDs as primary keys via `UUID(as_uuid=True)`, defaulting to `uuid.uuid4`
- Soft delete: set `deleted_at` timestamp, never hard-delete transactions
- All timestamps are timezone-aware UTC

**Schemas** (`app/schemas/`)
- Separate Pydantic schema files from ORM models
- `model_dump(exclude_none=True)` for partial updates (PATCH endpoints)

**Routes** (`app/api/routes/`)
- Always set `status_code=status.HTTP_201_CREATED` on POST routes that create resources
- Upsert endpoints return 200 for existing + updated, 201 for new (use `response: Response` param to override)
- Access control: use `Depends(require_household_role(["owner", "editor"]))` on every mutating route
- Private helpers within a route file are prefixed with `_`

**Dependency** (`app/api/deps.py`)
- `get_current_user` — extracts user from JWT
- `require_household_role(roles)` — verifies the current user is a member with one of the given roles

---

## Frontend Conventions

**Data fetching**
- All reads use `useQuery` from TanStack Query — never raw `useEffect` + fetch
- All writes use `useMutation` — never raw `.then()` chains inline in event handlers
- `queryClient.invalidateQueries` after mutations to refresh affected data

**State**
- Derived state from query data should use `useMemo` for stable references
- `localStorage` persistence (e.g. dismissed banners): read in `useEffect` keyed to the relevant dependency, not lazy `useState` init

**Utilities**
- Shared helpers live in `utils.js` — date formatting, label generation, metric calculation
- Module-level constant objects replace ternary chains for style/class lookups
- `envelopeLabel(e)` for `group / name` display; `monthLabelStr(monthStr)` for human-readable month

**Styling**
- Tailwind CSS only — no custom CSS except global resets in `index.css`
- Responsive: mobile-first

---

## Database Migration Workflow

1. Edit or add a model in `app/models/`
2. Run `alembic revision --autogenerate -m "describe change"`
3. Review the generated file in `alembic/versions/` — always check it before committing
4. Run `alembic upgrade head` locally to verify
5. Commit the migration file with your model change in the same PR

---

## Git & CI Workflow

- `main` is production — never commit directly
- Create a feature/fix branch → open PR → CI must be green → merge
- CI runs: `pytest --tb=short` (backend) + `npm run build` (frontend)
- Test credentials in CI: `DATABASE_URL=postgresql://test:test@localhost:5432/envelope_test`

---

## Key Domain Concepts

| Term | Meaning |
|---|---|
| Household | A budget group (shared between members with owner/editor/viewer roles) |
| Envelope | A named spending category within a household |
| Period | A monthly budget allocation for one envelope |
| Rollover | Unspent period balance that carries into next month |
| Transfer | Moving money between two envelopes (debit + credit pair linked by `transfer_id`) |
| Split | One payment divided across multiple envelopes (linked by `split_id`) |
| Bank ref | Unique transaction ID from bank file import — prevents duplicate imports |
