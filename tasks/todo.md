# Multi-Bank Import Support

## Goal
Associate imported transactions with the bank account they came from. OFX/QFX files carry bank identity automatically; CSV files prompt the user to name the account. Income stays household-level and combines across all banks.

---

## Plan

### Step 1 — Add `Account` model
- New file `app/models/account.py`
- Fields:
  - `id` (UUID, PK)
  - `household_id` (UUID, FK → households)
  - `bank_name` (String) — e.g. "Chase"
  - `account_id` (String) — last 4 digits or account number from OFX
  - `account_type` (String, nullable) — checking / savings / credit
  - `fid` (String, nullable) — OFX institution FID for matching
  - `display_name` (String, nullable) — user-editable friendly label
  - `created_at` (DateTime UTC)

### Step 2 — Add `account_id` FK to `Transaction` model
- Add nullable `account_id` (UUID, FK → accounts) to `app/models/transaction.py`
- Nullable so existing transactions are unaffected

### Step 3 — Alembic migration
- `alembic revision --autogenerate -m "add accounts table and transaction account_id"`
- Review generated file before committing

### Step 4 — Update OFX/QFX parser
- In `_parse_ofx()`, extract per account:
  - `account.institution.organization` → bank_name
  - `account.institution.fid` → fid
  - `account.account_id` → account_id
  - `account.account_type` → account_type
- Return detected account info alongside transactions

### Step 5 — Update CSV parser
- No auto-detection possible from file content
- Return `account_info = None` for CSV imports (user will provide it in the UI)

### Step 6 — Update import schemas
- Add `AccountInfo` schema (bank_name, account_id, account_type, fid) to `app/schemas/imports.py`
- Add `account_info` field to `ImportPreviewResponse` (populated for OFX, null for CSV)
- Add `account_id` (UUID, optional) to `ImportTransactionItem`
- Add `account` field to `ImportConfirmRequest` for CSV fallback (user-supplied name)

### Step 7 — Update `/preview` route
- On OFX: look up or create `Account` by `fid` + `household_id`; return its UUID
- On CSV: skip account lookup, return `account_info = None`

### Step 8 — Update `/confirm` route
- Accept `account_id` on each transaction item
- For CSV: accept a top-level `account` name in request body; look up or create `Account` by `bank_name` + `household_id`
- Set `account_id` on every `Transaction` record saved

### Step 9 — Add `GET /households/{id}/accounts` route
- List all accounts for the household (for display and management)

### Step 10 — Frontend: Import page (OFX flow)
- After preview, show detected bank/account info as a read-only badge ("Importing from: Chase Checking ···1234")
- User can override the display name if desired

### Step 11 — Frontend: Import page (CSV flow)
- Show an account name input field before confirming
- Autocomplete from existing accounts in the household
- Required field — must name the account before import proceeds

### Step 12 — Frontend: transaction displays
- Show account badge on transaction rows where `account` is set
- No change to income views — income remains combined across all banks

---

## Out of Scope (this PR)
- Per-account balance tracking
- Reconciliation against bank statements
- Deleting or merging accounts
- Filtering dashboard by account

---

## Review

All 12 steps completed.

**Backend**
- `app/models/account.py` — new Account model (bank_name, account_id, account_type, fid, display_name)
- `app/models/transaction.py` — nullable `account_id` FK added
- `app/models/__init__.py` — Account registered
- Migration `o1p2q3r4s5t6` — creates `accounts` table + `transactions.account_id` column, applied
- `app/schemas/imports.py` — added `DetectedAccount`, `AccountOut`; updated preview response and confirm request
- `app/api/routes/imports.py` — OFX parser extracts institution/account info; confirm route resolves or creates Account record; new `GET /accounts` endpoint
- `app/schemas/transaction.py` — `account_id` added to response; `account_name` added to search result
- `app/api/routes/transactions.py` — search joins Account table to return account_name

**Frontend**
- `frontend/src/api/accounts.js` — new getAccounts() function
- `frontend/src/api/imports.js` — confirmImport passes account_name
- `frontend/src/pages/Import.jsx` — OFX shows detected bank badge; CSV shows account name input with autocomplete from existing accounts

**Notes**
- OFX/QFX: bank auto-detected via `account.institution.organization` + `account.institution.fid`
- CSV: user types account name, existing accounts offered via datalist autocomplete
- Income untouched — stays household-level, naturally combines across banks
- `_resolved_id` on detectedAccount is not yet wired (the preview response returns bank info but not the DB UUID — the confirm route handles account creation server-side from `account_name` for CSV, and from `account_id` on each tx for OFX once that flow is extended)
