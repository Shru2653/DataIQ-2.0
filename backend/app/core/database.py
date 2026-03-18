from typing import Sequence
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from beanie import init_beanie

from app.core.config import get_settings

# Import Beanie models here when available
try:
    from app.models.dataset_model import Dataset
    MODELS: Sequence[type] = [Dataset]
except Exception:
    MODELS = []

_client: AsyncIOMotorClient | None = None

async def init_db() -> None:
    global _client
    settings = get_settings()
    _client = AsyncIOMotorClient(settings.MONGO_URI)
    await init_beanie(database=_client[settings.MONGO_DB], document_models=MODELS)

async def close_db() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None

def get_motor_client() -> AsyncIOMotorClient:
    if _client is None:
        # Lazily initialize if needed (should be initialized on startup normally)
        settings = get_settings()
        client = AsyncIOMotorClient(settings.MONGO_URI)
        # Do not assign globally in lazy path to avoid race; prefer startup init
        return client
    return _client

def get_db() -> AsyncIOMotorDatabase:
    client = get_motor_client()
    settings = get_settings()
    return client[settings.MONGO_DB]
