from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import UPLOAD_DIR, TEMP_DIR
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


app = FastAPI(title="DataIQ Backend", version="0.1.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static mounts
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
app.mount("/temp", StaticFiles(directory=TEMP_DIR), name="temp")


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


# Note: Do not auto-clean TEMP_DIR on exit to preserve cleaned files
