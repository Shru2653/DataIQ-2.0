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
  pip install -r requirements.txt
  python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
  ```

- Frontend
  ```powershell
  cd frontend
  npm install
  npm run dev
  ```

## Notes
- No virtual environment is created. Uses system `python` and `pip`.
- Upload supports: CSV, XLSX/XLS, PDF, Images (png/jpg/jpeg/gif/bmp/webp).
- Frontend previews:
  - CSV/XLSX/XLS: first rows in a table
  - Images: thumbnail preview
  - PDF: accepted and listed; open in new tab
