$ErrorActionPreference = "Stop"

# Run FastAPI app with auto-reload (no venv)
python -m pip install -r "$PSScriptRoot\requirements.txt"

$env:PYTHONUNBUFFERED = "1"
$env:PYTHONPATH = "$PSScriptRoot"

python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
