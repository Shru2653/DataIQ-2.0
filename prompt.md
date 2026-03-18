This is an excellent architectural step to scale your application. Your idea to split the `Dataset` model is exactly right.

Currently, your app is **file-centric**. All operations take a `filename`. We need to move to a **project-centric** model, where files are organized into containers (Projects), and all operations reference a file's unique database ID, not just its name.

Here is a detailed breakdown of the changes needed for your database, backend, and React frontend.

-----

## 1\. 🏛️ Database (Model) Changes

You are correct to split your old `Dataset` model. We will create three distinct models.

### `Project` Model

This is the top-level "folder" that belongs to a user.

**(New File: `app/models/project_model.py`)**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from app.models.pyobjectid import PydanticObjectId

class ProjectBase(BaseModel):
    name: str = Field(..., max_length=100)
    description: str | None = Field(None, max_length=500)

class ProjectCreate(ProjectBase):
    pass

class ProjectInDB(ProjectBase):
    id: PydanticObjectId = Field(..., alias="_id")
    user_id: PydanticObjectId
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {PydanticObjectId: str}
        allow_population_by_field_name = True
```

### `Dataset` Model

This represents a single **original uploaded file**. It replaces your old `Dataset` model and links to a `Project`.

**(Modify: `app/models/dataset_model.py`)**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from app.models.pyobjectid import PydanticObjectId

class DatasetBase(BaseModel):
    project_id: PydanticObjectId
    user_id: PydanticObjectId
    original_filename: str = Field(..., max_length=255)
    stored_filename: str = Field(..., max_length=255) # The unique name on disk
    size: int
    content_type: str | None = None
    status: str = Field(default="uploaded") # e.g., uploaded, processing, error
    schema: dict | None = None # Store column info

class DatasetInDB(DatasetBase):
    id: PydanticObjectId = Field(..., alias="_id")
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    # The 'cleaned_versions' list is REMOVED

    class Config:
        json_encoders = {PydanticObjectId: str}
        allow_population_by_field_name = True
```

### `ProcessedFile` Model

This represents a **cleaned or modified version** of a `Dataset`. This model replaces the old `cleaned_versions` list.

**(New File: `app/models/processed_file_model.py`)**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Dict, Any
from app.models.pyobjectid import PydanticObjectId

class ProcessedFileBase(BaseModel):
    project_id: PydanticObjectId
    dataset_id: PydanticObjectId  # Links to the original DatasetInDB
    user_id: PydanticObjectId
    stored_filename: str  # The new file name on disk
    size: int
    operation: str  # e.g., "duplicates", "missing_values", "features"
    operation_details: Dict[str, Any] | None = None # e.g., {'action': 'keep_first'}

class ProcessedFileInDB(ProcessedFileBase):
    id: PydanticObjectId = Field(..., alias="_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_encoders = {PydanticObjectId: str}
        allow_population_by_field_name = True
```

-----

## 2\. 🚀 Backend (FastAPI) Changes

This is the most significant part. All your routes must stop using `filename` and start using `dataset_id`.

### A. New `Project` Endpoints

You need new routes to manage projects.

**(New File: `app/routes/project_routes.py`)**

```python
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.models.project_model import ProjectCreate, ProjectInDB
from app.models.user_model import UserInDB
from app.utils.auth_utils import get_current_active_user
from app.core.database import get_db

router = APIRouter()

@router.post("/api/projects", response_model=ProjectInDB)
async def create_project(
    project: ProjectCreate,
    current_user: UserInDB = Depends(get_current_active_user),
    db = Depends(get_db)
):
    # Logic to insert a new project doc with user_id
    # ...
    pass

@router.get("/api/projects", response_model=List[ProjectInDB])
async def list_projects(
    current_user: UserInDB = Depends(get_current_active_user),
    db = Depends(get_db)
):
    # Logic to find all projects for current_user.id
    # ...
    pass

@router.get("/api/projects/{project_id}")
async def get_project_details(
    project_id: str,
    current_user: UserInDB = Depends(get_current_active_user),
    db = Depends(get_db)
):
    # Logic to find the project AND all associated DatasetInDB docs
    # ...
    pass
```

### B. Modify File Upload

The upload route must now accept a `project_id`.

**(Modify: `files_routes.py`)**

```python
# Change the /upload route
@router.post("/api/projects/{project_id}/upload")
async def upload_files(
    project_id: str,
    files: list[UploadFile] = File(...),
    current_user: UserInDB = Depends(get_current_active_user),
):
    # ...
    # 1. Validate project_id exists and belongs to user
    # ...
    for f in files:
        # ... save file to disk with a unique name (e.g., using uuid)
        stored_name = f"{uuid.uuid4()}_{f.filename}"
        dest_path = ufiles / stored_name
        
        # ... save file ...

        # Instead of register_upload, create a DatasetInDB document
        dataset_doc = DatasetBase(
            project_id=project_id,
            user_id=current_user.id,
            original_filename=f.filename,
            stored_filename=stored_name,
            size=dest_path.stat().st_size,
            content_type=f.content_type
        )
        await db["datasets"].insert_one(dataset_doc.dict())
        saved.append(dataset_doc)
    
    return {"uploaded_datasets": saved}
```

### C. Modify ALL Processing Routes (Crucial Change)

All your processing routes (`features_routes.py`, `duplicates_routes.py`,`normalize_routes.py`, `outliers_routes.py`, `missing_values_routes.py`, `duplicates_routes.py`, `dax_routes.py`, `analyze_routes.py`,`standardize_routes.py`,`filter_routes`,`dataset_info_routes.py`,datatypes_routes.py,etc.) must be updated.

**1. Change Request Models:**
In **every** request model (e.g., `FeatureRequest`, `DuplicatesHandleRequest`, `NormalizeRequest`), change `filename` to `dataset_id`.

  * **Before (in `features_routes.py`):**
    ```python
    class FeatureRequest(BaseModel):
        filename: str
        # ...
    ```
  * **After:**
    ```python
    from app.models.pyobjectid import PydanticObjectId

    class FeatureRequest(BaseModel):
        dataset_id: PydanticObjectId # Use the DB ID
        # ...
    ```

**2. Change the Data Loader Function:**
Your `_load_dataframe_for_processing_user` function must be rewritten to use `dataset_id`.

  * **Before (in `features_routes.py`, `normalize_routes.py`, etc.):**
    ```python
    def _load_dataframe_for_processing_user(filename: str, current_user: UserInDB) -> pd.DataFrame:
        files_dir = user_files_dir(current_user.id)
        file_path = files_dir / filename
        # ...
    ```
  * **After (Create a shared util, e.g., `app/services/dataset_service.py`):**
    ```python
    from app.core.database import get_db
    from app.models.dataset_model import DatasetInDB

    async def _load_dataframe_for_processing_user(
        dataset_id: str, 
        current_user: UserInDB,
        db = Depends(get_db) # You'll need to inject the db
    ) -> pd.DataFrame:
        
        # 1. Find the dataset doc in MongoDB
        dataset_doc = await db["datasets"].find_one({
            "_id": PydanticObjectId(dataset_id),
            "user_id": current_user.id
        })
        
        if not dataset_doc:
            raise HTTPException(status_code=404, detail="Dataset not found")
        
        dataset = DatasetInDB.parse_obj(dataset_doc)
        
        # 2. Get the *stored_filename* from the doc
        files_dir = user_files_dir(current_user.id)
        file_path = files_dir / dataset.stored_filename
        
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        
        # 3. Load from disk
        try:
            # ... (your existing pd.read_csv/read_excel logic) ...
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")
    ```

**3. Change "Apply" Logic:**
When saving a cleaned file, you must now create a `ProcessedFileInDB` document instead of using `add_cleaned_version`.

  * **Before (in `features_routes.py`):**
    ```python
    # ...
    await add_cleaned_version(current_user.id, request.filename, out_name)
    # ...
    ```
  * **After (in `features_routes.py`):**
    ```python
    # ...
    # Get the original dataset to copy project_id
    original_dataset = await db["datasets"].find_one({"_id": request.dataset_id})

    # Create the new document
    processed_doc = ProcessedFileBase(
        project_id=original_dataset["project_id"],
        dataset_id=request.dataset_id,
        user_id=current_user.id,
        stored_filename=out_name,
        size=out_path.stat().st_size,
        operation="features", # Or request.settings.action
        operation_details=request.settings.dict()
    )
    await db["processed_files"].insert_one(processed_doc.dict())

    return FeatureResponse(
        # ...
        new_file=out_name, # Return name for preview
        # ...
    )
    ```

### D. Add Batch Processing (The "Project" Level)

To clean `sales_jan.csv`, `sales_feb.csv`, etc., at once, you need a background task system. **Celery** is the standard.

1.  **Add Celery:** Integrate Celery with your FastAPI app to run long-running jobs.
2.  **Create a "Batch" Endpoint:**
    ```python
    # In project_routes.py
    class BatchRequest(BaseModel):
        dataset_ids: List[PydanticObjectId]
        action_type: str # e.g., "duplicates"
        settings: Dict[str, Any] # e.g., {"action": "keep_first", "subset": []}

    @router.post("/api/projects/{project_id}/batch-apply")
    async def batch_apply_operation(
        project_id: str,
        request: BatchRequest,
        current_user: UserInDB = Depends(get_current_active_user)
    ):
        # 1. Validate project_id and dataset_ids
        # 2. Launch a Celery task for EACH dataset_id
        for dataset_id in request.dataset_ids:
            # tasks.py
            # run_cleaning_task.delay(
            #     dataset_id, 
            #     request.action_type, 
            #     request.settings
            # )
            pass
        
        return {"message": "Batch processing started."}
    ```
3.  The Celery worker would then execute your *existing* cleaning logic (e.g., the core of `handle_duplicates`) for each file, creating a new `ProcessedFileInDB` doc upon completion.
