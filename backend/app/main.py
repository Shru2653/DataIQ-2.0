from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

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



app = FastAPI(title="DataIQ Backend", version="0.1.0")
settings = get_settings()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sessions for OAuth (required by Authlib for google.authorize_redirect)
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


# Routers
app.include_router(files_router)
app.include_router(analyze_router)
app.include_router(filters_router)
app.include_router(dataset_info_router)
app.include_router(missing_values_router)
app.include_router(datatypes_router)
app.include_router(duplicates_router)
app.include_router(standardize_router)
app.include_router(outliers_router)
app.include_router(normalize_router)
app.include_router(features_router)
app.include_router(dax_router)
app.include_router(cleanup_router)
app.include_router(auth_router)
app.include_router(data_quality_router)
app.include_router(cleaning_recommendations_router)
app.include_router(drift_detection_router)
app.include_router(chatbot_router, prefix="/api/chatbot", tags=["Chatbot"])



# Note: Do not auto-clean TEMP_DIR on exit to preserve cleaned files
