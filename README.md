# DataIQ (FastAPI + React)

## Quick Start (Windows PowerShell)

1. Run both servers (installs deps automatically):
   
   ```powershell
   ./run_all.ps1
   ```

2. Open the app:
   - Frontend: `http://localhost:5173`
   - Backend: `http://localhost:8000/docs`

## Manual

- Backend
  ```powershell
  cd backend
  # Recommended: use the repo venv created by run_all.ps1
  ..\.venv\Scripts\python -m pip install -r requirements.txt
  ..\.venv\Scripts\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  ```

- Frontend
  ```powershell
  cd frontend
  npm install
  npm run dev
  ```

## Notes
- `run_all.ps1` uses a local virtual environment at `.venv` (recommended).
- If you run commands manually, you can either use `.venv` or your system Python, but **using `.venv` avoids polluting global packages**.
- Upload supports: CSV, XLSX/XLS, PDF, Images (png/jpg/jpeg/gif/bmp/webp).
- Frontend previews:
  - CSV/XLSX/XLS: first rows in a table
  - Images: thumbnail preview
  - PDF: accepted and listed; open in new tab
