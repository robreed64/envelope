from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import auth, backup, envelopes, households, imports, income, invites, me, notifications, payees, periods, recurring, reports, transactions
from app.core.config import settings

app = FastAPI(title="Envelope Budget API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(households.router)
app.include_router(envelopes.router)
app.include_router(periods.router)
app.include_router(periods.copy_router)
app.include_router(transactions.router)
app.include_router(transactions.transfer_router)
app.include_router(transactions.split_router)
app.include_router(transactions.search_router)
app.include_router(income.router)
app.include_router(recurring.router)
app.include_router(payees.router)
app.include_router(reports.router)
app.include_router(imports.router)
app.include_router(invites.router)
app.include_router(backup.router)
app.include_router(notifications.router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/config")
def config():
    return {"base_url": settings.public_url.rstrip("/") or None}


DIST = Path("frontend/dist")
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(DIST / "index.html")
