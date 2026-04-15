# Dataset Versioning System - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Backend is Ready ✅
The API endpoints are already integrated:
```bash
GET /api/datasets/grouped        # All datasets
GET /api/datasets/{name}         # Specific dataset
GET /api/datasets/{name}/latest  # Latest version
```

**No configuration needed!** Just start the server:
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8001
```

### 2. Frontend Components Ready ✅
Three main components are ready to use:

**`VersionCard.jsx`** - Single version display
**`DatasetCard.jsx`** - Collapsible dataset
**`DatasetVersionList.jsx`** - Complete list (use this!)

### 3. Basic Integration (Copy-Paste)

#### Option A: Simple - Just Replace FileList

```jsx
// frontend/src/pages/Home.jsx

// REMOVE THIS:
// import FileList from '../components/files/FileList';
// <FileList files={files} onSelect={handleSelect} />

// ADD THIS:
import DatasetVersionList from '../components/dashboard/DatasetVersionList';

export default function Home() {
  return (
    <div>
      <DatasetVersionList
        onSelectFile={(file) => {
          console.log('Selected:', file);
          // Handle file selection
        }}
        onDownloadFile={(filename) => {
          console.log('Download:', filename);
          // Handle download
        }}
      />
    </div>
  );
}
```

#### Option B: Advanced - Use the Hook

```jsx
import useDatasetVersioning from '../hooks/useDatasetVersioning';

export default function Dashboard() {
  const { datasets, isLoading, downloadVersion } = useDatasetVersioning();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Datasets: {datasets.length}</h1>
      {datasets.map((dataset) => (
        <div key={dataset.dataset_name}>
          <h2>{dataset.dataset_name}</h2>
          <p>Versions: {dataset.version_count}</p>
          <button onClick={() => downloadVersion(dataset.latest_version.filename)}>
            Download Latest
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 📋 What You Get

### Backend
✅ Automatic filename parsing
✅ Dataset grouping by name
✅ Version ordering by timestamp
✅ Human-readable operation labels
✅ 3 new API endpoints
✅ Caching & optimization

### Frontend
✅ 3 professional React components
✅ Responsive design (mobile → desktop)
✅ Smooth animations
✅ Loading/error/empty states
✅ React Query integration
✅ Full TypeScript ready

### Documentation
✅ DATASET_VERSIONING_GUIDE.md (complete reference)
✅ DATASET_VERSIONING_SUMMARY.md (overview)
✅ DATASET_VERSIONING_UI_REFERENCE.md (visual guide)
✅ INTEGRATION_EXAMPLES.jsx (5 examples)

---

## 📝 How It Works

### Example: File Upload Flow

**User uploads test_outliers_data.csv**
```
File: test_outliers_data.csv
├─ Dataset: test_outliers_data
├─ Operation: original
└─ Version: 1
```

**File is processed with outlier removal → outlier_handled_test_outliers_data_20260406_143000.csv**
```
File: outlier_handled_test_outliers_data_20260406_143000.csv
├─ Dataset: test_outliers_data
├─ Operation: outliers_removed
├─ Version: 2
└─ Parent: v1
```

**In UI, user sees:**
```
Dataset: TEST_OUTLIERS_DATA

v1: Original Dataset (8:30 AM)
v2: Outliers Removed (2:43 PM) ⭐ LATEST
```

---

## 🔧 Filename Patterns (Auto-Detected)

The system automatically recognizes these patterns:

```
Original file:
  → test_data.csv
  → sales_data.xlsx

Outlier handling:
  → outlier_handled_test_data_*.csv
  → outliers_removed_sales_data_*.csv

Normalization:
  → normalized_test_data_*.csv

Encoding:
  → encoded_test_data_*.csv

And 6+ more patterns...
```

**Timestamp format:** `yyyymmdd_hhmmss`
- `20260406_143000` = April 6, 2026 at 2:43:00 PM

---

## 📊 API Response Example

```bash
curl http://localhost:8001/api/datasets/grouped
```

```json
{
  "datasets": [
    {
      "dataset_name": "test_outliers_data",
      "version_count": 2,
      "created_at": "2026-04-06T08:30:00Z",
      "updated_at": "2026-04-06T14:43:00Z",
      "latest_version": {
        "version": 2,
        "operation": "outliers_removed",
        "human_readable_name": "Outliers Removed",
        "filename": "outlier_handled_test_outliers_data_20260406_143000.csv",
        "file_size": 98560,
        "created_at": "2026-04-06T14:43:00Z"
      },
      "versions": [
        {
          "version": 1,
          "operation": "original",
          "human_readable_name": "Original Dataset",
          "filename": "test_outliers_data.csv",
          "file_size": 120000,
          "created_at": "2026-04-06T08:30:00Z"
        },
        {
          "version": 2,
          "operation": "outliers_removed",
          "human_readable_name": "Outliers Removed",
          "filename": "outlier_handled_test_outliers_data_20260406_143000.csv",
          "file_size": 98560,
          "created_at": "2026-04-06T14:43:00Z",
          "parent_version": 1
        }
      ]
    }
  ],
  "total_count": 1
}
```

---

## ✨ Key Features

### 1. Automatic Organization
No manual sorting needed - files are grouped by dataset automatically

### 2. Version Lineage
Clear parent-child relationships between versions
```
Original → Outliers Removed → Normalized → Final
```

### 3. Latest Highlighting
New versions automatically marked as "Latest"

### 4. Responsive Design
Perfect on mobile, tablet, and desktop

### 5. Professional UX
Smooth animations, clear feedback, accessible

---

## 🧪 Test It Out

### 1. Start Backend
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8001
```

### 2. Test API
```bash
curl http://localhost:8001/api/datasets/grouped
```

### 3. Add Some Test Files
Create files in `backend/static/uploads/`:
```
test_data.csv
outlier_handled_test_data_20260406_140000.csv
normalized_test_data_20260406_141000.csv
```

### 4. Refresh API
```bash
curl http://localhost:8001/api/datasets/grouped
```
You should see them grouped!

### 5. Add to UI
Update Home.jsx with DatasetVersionList component

### 6. Run Frontend
```bash
cd frontend
npm run dev
```

Visit http://localhost:5173 and see your datasets!

---

## 🎯 Common Tasks

### Task: Show Only Latest Versions
```jsx
const getLatestVersions = (datasets) => {
  return datasets.map((d) => d.latest_version);
};
```

### Task: Download Specific Version
```jsx
const handleDownload = async (version) => {
  await downloadVersion(version.filename);
};
```

### Task: Filter by Dataset
```jsx
const getDataset = (datasets, name) => {
  return datasets.find((d) => d.dataset_name === name);
};
```

### Task: Get Version Count
```jsx
const getTotalVersions = (datasets) => {
  return datasets.reduce((sum, d) => sum + d.version_count, 0);
};
```

### Task: Check if Version is Latest
```jsx
const isLatest = (version, dataset) => {
  return version.version === dataset.versions.length;
};
```

---

## 🐛 Troubleshooting

### "Datasets not showing in UI?"
1. Check `/api/datasets/grouped` endpoint
2. Verify files are in `backend/static/uploads/`
3. Check browser DevTools → Network tab
4. Check backend console for errors

### "Wrong operation detected?"
1. Check filename pattern matches operation prefix
2. Add new pattern to `dataset_utils.py` if needed
3. Restart backend server

### "Versions in wrong order?"
1. Ensure timestamps are in `yyyymmdd_hhmmss` format
2. Check file modification times
3. Verify timezone consistency

### "Download not working?"
1. Implement `/api/files/download/{filename}` endpoint
2. Or use fallback callback `onDownloadFile`
3. Check CORS settings

---

## 📁 File Structure

```
✅ Backend Files (Done)
├── app/models/dataset_model.py (Updated)
├── app/utils/dataset_utils.py (New)
├── app/routes/dataset_versioning_routes.py (New)
└── app/main.py (Updated)

✅ Frontend Files (Done)
├── src/components/dashboard/
│   ├── VersionCard.jsx (New)
│   ├── DatasetCard.jsx (New)
│   ├── DatasetVersionList.jsx (New)
│   └── INTEGRATION_EXAMPLES.jsx (New)
├── src/hooks/
│   └── useDatasetVersioning.js (New)
└── (Update your Home.jsx here)

✅ Documentation (Done)
├── DATASET_VERSIONING_GUIDE.md
├── DATASET_VERSIONING_SUMMARY.md
├── DATASET_VERSIONING_UI_REFERENCE.md
└── This file!
```

---

## ✅ Checklist

- [ ] Backend running on port 8001
- [ ] API endpoint `/api/datasets/grouped` responds
- [ ] Sample files uploaded to `backend/static/uploads/`
- [ ] Frontend started on port 5173
- [ ] Imported DatasetVersionList in Home.jsx
- [ ] Tested version selection callback
- [ ] Tested download functionality
- [ ] Checked mobile responsiveness
- [ ] Reviewed documentation
- [ ] Deployed to production!

---

## 📚 Documentation Structure

```
START HERE:
└─ This file (QUICK START)
   │
   ├─ DATASET_VERSIONING_GUIDE.md
   │  └─ Complete reference with all details
   │
   ├─ INTEGRATION_EXAMPLES.jsx
   │  └─ 5 practical code examples
   │
   ├─ DATASET_VERSIONING_UI_REFERENCE.md
   │  └─ Visual layouts and design
   │
   └─ DATASET_VERSIONING_SUMMARY.md
      └─ Full feature overview
```

---

## 🎓 Learning Path

1. **Read:** This Quick Start (5 min)
2. **Reference:** DATASET_VERSIONING_GUIDE.md (15 min)
3. **Code:** INTEGRATION_EXAMPLES.jsx (10 min)
4. **Visual:** DATASET_VERSIONING_UI_REFERENCE.md (5 min)
5. **Integrate:** Update Home.jsx (10 min)
6. **Test:** Run and verify (10 min)

**Total time: ~55 minutes**

---

## 💡 Pro Tips

1. **Use consistent filenames** for best automatic detection
2. **Include timestamps** for accurate version ordering
3. **Test API manually** before integrating UI
4. **Use React DevTools** to inspect component state
5. **Monitor API performance** as dataset count grows
6. **Cache aggressively** on frontend (already done)
7. **Validate filenames** before upload if possible

---

## 🚀 Next Steps

1. ✅ Read this Quick Start
2. ✅ Review INTEGRATION_EXAMPLES.jsx for your use case
3. ✅ Update Home.jsx with DatasetVersionList
4. ✅ Test with sample files
5. ✅ Deploy to production

---

## 📌 Important Files to Know

| File | Purpose | Status |
|------|---------|--------|
| `app/models/dataset_model.py` | Data models | ✅ Ready |
| `app/utils/dataset_utils.py` | Filename parsing | ✅ Ready |
| `app/routes/dataset_versioning_routes.py` | API endpoints | ✅ Ready |
| `VersionCard.jsx` | Single version UI | ✅ Ready |
| `DatasetCard.jsx` | Dataset UI | ✅ Ready |
| `DatasetVersionList.jsx` | Main component | ✅ Ready |
| `useDatasetVersioning.js` | React hook | ✅ Ready |

---

## 🎉 Success!

Once integrated, your users will see:

**Before:**
```
test_outliers_data.csv
outlier_handled_test_outliers_data_20260406_203707.csv
normalized_test_outliers_data_20260406_205000.csv
```

**After:**
```
Dataset: TEST_OUTLIERS_DATA

v1: Original Dataset (8:30 PM)
v2: Outliers Removed (8:37 PM)
v3: Normalized (8:50 PM) ⭐ LATEST
```

**Much better!** 🎊

---

## 📞 Questions?

1. Check the complete guide: DATASET_VERSIONING_GUIDE.md
2. Review examples: INTEGRATION_EXAMPLES.jsx
3. See visual layouts: DATASET_VERSIONING_UI_REFERENCE.md
4. Read summary: DATASET_VERSIONING_SUMMARY.md

---

**Happy data versioning! 🚀**
