from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import UPLOAD_DIR, TEMP_DIR, get_settings
from app.core.database import init_db, close_db

from app.routes.files_routes import router as files_router
from app.routes.analyze_routes import router as analyze_router
from app.routes.filters_routes import router as filters_router
from app.routes.dataset_info_routes import router as dataset_info_router
from app.routes.missing_values_routes import router as missing_values_router
from app.routes.datatypes_routes import router as datatypes_router
from app.routes.duplicates_routes import router as duplicates_router
from app.routes.standardize_routes import router as standardize_router
from app.routes.outliers_routes import router as outliers_router
from app.routes.normalize_routes import router as normalize_router
from app.routes.features_routes import router as features_router
from app.routes.dax_routes import router as dax_router
from app.routes.cleanup_routes import router as cleanup_router
from app.routes.auth_routes import router as auth_router
from app.routes.data_quality_routes import router as data_quality_router
from app.routes.cleaning_recommendations_routes import router as cleaning_recommendations_router
from app.routes.drift_detection_routes import router as drift_detection_router
from app.routes.chatbot_routes import router as chatbot_router
from app.routes.dashboard_routes import router as dashboard_router
from app.routes.preview_routes import router as preview_router
from app.routes.dataset_versioning_routes import router as dataset_versioning_router


class LegacyApiPathRewriteMiddleware(BaseHTTPMiddleware):
    """
    Keep backward compatibility for legacy non-/api clients without
    registering every router twice (which clutters docs and doubles routes).
    """

    def __init__(self, app, prefix: str = "/api"):
        super().__init__(app)
        self.prefix = prefix

        # paths we should never rewrite
        self._skip_prefixes = (
            "/api",
            "/dashboard",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/health",
        )

    async def dispatch(self, request: Request, call_next):
        path = request.scope.get("path") or ""
        if path and not path.startswith(self._skip_prefixes):
            # Rewrite `/foo` -> `/api/foo`
            request.scope["path"] = f"{self.prefix}{path}"
            # Also update raw_path for Starlette routing
            request.scope["raw_path"] = request.scope["path"].encode("ascii", "ignore")
        return await call_next(request)


app = FastAPI(title="DataIQ Backend", version="0.1.0")
settings = get_settings()

# CORS (battle-tested default middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Backward compatible legacy paths (no duplicate route registration)
app.add_middleware(LegacyApiPathRewriteMiddleware, prefix="/api")

# Sessions for OAuth
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SECRET_KEY,
    same_site="lax",
)

# Static mounts removed: use secure download endpoints instead


@app.on_event("startup")
async def _startup():
    await init_db()


@app.on_event("shutdown")
async def _shutdown():
    await close_db()


# Canonical API surface: prefer `/api/*` paths.
# NOTE: some routers already declare `/api` in their own prefix/paths; those
# are included without an extra prefix to avoid double `/api/api/*`.
app.include_router(files_router, prefix="/api")
app.include_router(analyze_router, prefix="/api")
app.include_router(filters_router, prefix="/api")
app.include_router(dataset_info_router, prefix="/api")
app.include_router(missing_values_router, prefix="/api")
app.include_router(datatypes_router, prefix="/api")
app.include_router(duplicates_router, prefix="/api")
app.include_router(standardize_router, prefix="/api")
app.include_router(outliers_router, prefix="/api")
app.include_router(normalize_router, prefix="/api")
app.include_router(features_router, prefix="/api")
app.include_router(dax_router, prefix="/api")
app.include_router(cleanup_router, prefix="/api")
app.include_router(data_quality_router, prefix="/api")
app.include_router(cleaning_recommendations_router, prefix="/api")
app.include_router(drift_detection_router, prefix="/api")
app.include_router(preview_router, prefix="/api")

# Routers that already define `/api` internally
app.include_router(auth_router)  # prefix="/api/auth"
app.include_router(dataset_versioning_router)  # prefix="/api/dataset-versions"
app.include_router(dashboard_router)  # routes are declared as "/api/dashboard/*"

# Routers with their own sub-prefixes (no internal /api paths)
app.include_router(chatbot_router, prefix="/api/chatbot", tags=["Chatbot"])

