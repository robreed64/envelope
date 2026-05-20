# Lessons Learned

## 1. Never hot-patch a running Docker container to apply backend changes

**What happened:** After making Python file changes, I copied files into the running container and tried to restart uvicorn in-place. This killed the container (uvicorn was the child of the entrypoint shell, so killing it stopped the container), left it in a permission-denied state Docker couldn't recover from, and broke the container network.

**Rule:** For backend code changes, always do a full `docker compose up --build -d`. It's slower but reliable. Hot-patching containers mid-session causes state corruption that's hard to recover from without a machine reboot.

---

## 2. Run the migration before rebuilding, not inside the container copy cycle

**What happened:** The alembic migration was written manually (couldn't autogenerate because `alembic.ini` hardcodes the Docker `db` hostname, unreachable from the host). We had to copy the migration into the running container and run it there. This worked, but added a fragile intermediate step.

**Rule:** Either (a) update `alembic.ini` to read `DATABASE_URL` from the environment so migrations can be generated from the host, or (b) always generate migrations inside the container with `docker compose exec api alembic revision --autogenerate -m "..."` from the start — never copy migration files in manually mid-session.

---

## 3. `alembic.ini` should not hardcode the database hostname

**What happened:** `alembic.ini` has `sqlalchemy.url = postgresql://envelope_user:password@db:5432/envelope_db`. The `db` hostname only resolves inside the Docker network, so alembic can't be run from the host for autogenerate or upgrades.

**Fix to make:** Update `alembic/env.py` to prefer `DATABASE_URL` from the environment, falling back to `alembic.ini`. This is a one-line change and unblocks local dev entirely.

---

## 4. Plan the deployment step before starting implementation

**What happened:** All code changes were correct, but we didn't think through how to get them live until the end — and that's where everything broke down.

**Rule:** Before writing any code, answer: "How will I deploy this?" For this project that means: rebuild the image, which requires `docker compose up --build`. Any workflow that involves copying files mid-session should be a red flag.

---

## 5. Always use `init: true` on api containers in docker-compose.yml

**What happened:** The api service ran uvicorn as a grandchild of `sh -c`. Docker signals PID 1 (the shell) to stop the container, but on cgroup v2 + AppArmor systems this results in "permission denied" — the shell doesn't forward signals and Docker can't kill it.

**Rule:** Add `init: true` to any service whose entrypoint is a shell command (`sh -c ...`). This inserts tini as PID 1, which properly receives and forwards signals to child processes. Fix already applied to `docker-compose.yml`.

---

## 6. Commit at each completed step, not at the end

**What happened:** All 12 steps were implemented in one session with zero commits. When the container broke, there was no clean checkpoint to fall back to — and no way to tell what was in the running container vs. what was on disk vs. what was actually working.

**Rule:** Commit after each logical step: model changes, migration, schema/route changes, frontend changes. Small commits also make it easier to bisect if something breaks. The plan in `todo.md` maps directly to commit boundaries.

---

## 6. Create a feature branch before starting work

**What happened:** All changes were made directly on `test/ci-check` — a branch that exists for a different purpose. If the work had been abandoned mid-way, that branch would be left in a broken state.

**Rule:** Always create a dedicated branch before starting a feature (`git checkout -b feat/multi-bank-import`). Keep unrelated branches clean. Open a PR when the feature is complete and CI is green.
