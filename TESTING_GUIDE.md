# DataIQ Universal Testing Guide

## Overview
This guide covers the comprehensive testing system for DataIQ that tests all modules and functionalities in one unified test suite.

## Test Files

### 1. `universal_test_dataset.csv`
- **Purpose**: Comprehensive test dataset designed to test all DataIQ modules
- **Features**:
  - 20 rows of realistic employee data
  - Missing values in multiple columns (salary, department, join_date, score)
  - Duplicate entries (John Doe appears twice)
  - Various data types: integers, floats, strings, booleans, dates
  - Invalid data (invalid date format)
  - Different categories for filtering tests

### 2. `universal_test.py`
- **Purpose**: Main test script that tests all DataIQ endpoints and modules
- **Features**:
  - Colored terminal output for easy reading
  - Comprehensive error handling and reporting
  - Detailed test results with pass/fail status
  - JSON output for automated analysis
  - Tests all major functionalities

### 3. `run_tests.ps1`
- **Purpose**: PowerShell script for easy test execution
- **Features**:
  - Checks Python installation and dependencies
  - Verifies server is running before testing
  - Installs missing packages automatically
  - Provides clear status messages

## Modules Tested

### 🔧 Core Functionality
- ✅ **Server Health**: Basic server connectivity
- ✅ **File Upload**: Multi-file upload capability
- ✅ **File Listing**: Retrieve uploaded files
- ✅ **File Preview**: CSV/Excel preview generation

### 📊 Data Analysis
- ✅ **Dataset Analysis**: Basic dataset statistics
- ✅ **Dataset Info**: Column and row information

### 🔍 Data Processing
- ✅ **Apply Filters**: Column selection, range filtering, value filtering
- ✅ **Missing Values Preview**: Identify missing data patterns
- ✅ **Missing Values Handle**: Drop rows/columns, fill strategies
- ✅ **Data Types Preview**: Analyze current and suggested types
- ✅ **Data Types Convert**: Auto-detect, numeric conversion, datetime parsing
- ✅ **Duplicates Preview**: Identify duplicate records
- ✅ **Duplicates Handle**: Remove, keep first/last, mark duplicates

### 🧹 Maintenance
- ✅ **Cleanup Status**: Check processed files status
- ✅ **Cleanup Processed Files**: Remove temporary files

## How to Run Tests

### Prerequisites
1. **DataIQ Server Running**: Start the backend server first
   ```powershell
   cd backend
   ./run.ps1
   ```

2. **Python Dependencies**: Ensure you have `requests` and `pandas` installed
   ```powershell
   pip install requests pandas
   ```

### Running Tests

#### Option 1: Using PowerShell Script (Recommended)
```powershell
cd backend
./run_tests.ps1
```

#### Option 2: Direct Python Execution
```powershell
cd backend
python universal_test.py
```

## Test Output

### Terminal Output
The test script provides colored terminal output:
- 🟢 **Green**: Successful tests
- 🔴 **Red**: Failed tests  
- 🔵 **Blue**: Information messages
- 🟡 **Yellow**: Warnings

### Example Output
```
🚀 Starting DataIQ Universal Test Suite
Testing against: http://localhost:8000
Test dataset: universal_test_dataset.csv
============================================================
ℹ️  Running: Server Health
✅ Server Health Check: PASSED
----------------------------------------
ℹ️  Running: File Upload
✅ File Upload: PASSED
----------------------------------------
...
============================================================
📊 TEST SUMMARY
============================================================
Total Tests: 15
✅ Passed: 15
✅ Failed: 0
Success Rate: 100.0% 🎉
============================================================
```

### JSON Results
Test results are automatically saved to `test_results.json`:
```json
{
  "passed": 15,
  "failed": 0,
  "total": 15,
  "details": [
    {
      "test": "Server Health Check",
      "passed": true,
      "details": ""
    }
  ]
}
```

## Test Dataset Details

The `universal_test_dataset.csv` contains:

| Column | Type | Missing Values | Special Cases |
|--------|------|----------------|---------------|
| id | Integer | None | Sequential IDs |
| name | String | None | Duplicate "John Doe" |
| age | Integer | 2 missing | Range 24-45 |
| salary | Float | 2 missing | Various ranges |
| department | String | 2 missing | Engineering, Marketing, Sales |
| join_date | Date | 3 missing | 1 invalid format |
| is_active | Boolean | None | True/False values |
| score | Float | 2 missing | Range 78-93 |
| category | String | None | A, B, C categories |
| notes | String | 1 missing | Text descriptions |

## Troubleshooting

### Common Issues

1. **Server Not Running**
   ```
   ❌ DataIQ server is not running or not accessible
   ```
   **Solution**: Start the backend server first with `./run.ps1`

2. **Missing Dependencies**
   ```
   ❌ requests not found. Installing...
   ```
   **Solution**: The script will auto-install, or run `pip install requests pandas`

3. **Test File Not Found**
   ```
   ❌ Test dataset not found: universal_test_dataset.csv
   ```
   **Solution**: Ensure you're running from the `backend` directory

4. **Port Conflicts**
   ```
   ❌ Server responded with status: 404
   ```
   **Solution**: Verify server is running on port 8000, check `BASE_URL` in test script

### Manual Verification

If tests fail, you can manually verify endpoints:
1. **Health Check**: Visit `http://localhost:8000/health`
2. **API Docs**: Visit `http://localhost:8000/docs`
3. **Upload Test**: Use the frontend at `http://localhost:5173`

## Customization

### Adding New Tests
To add tests for new modules:

1. **Add Test Method**: Create a new test method in `DataIQTester` class
   ```python
   def test_new_module(self) -> bool:
       try:
           # Your test logic here
           response = self.session.post(f"{BASE_URL}/new-endpoint", json=data)
           if response.status_code == 200:
               self.record_test("New Module", True)
               return True
           else:
               self.record_test("New Module", False, f"Status: {response.status_code}")
               return False
       except Exception as e:
           self.record_test("New Module", False, str(e))
           return False
   ```

2. **Add to Test Sequence**: Include in `run_all_tests()` method
   ```python
   tests = [
       # ... existing tests
       ("New Module", self.test_new_module),
   ]
   ```

### Modifying Test Data
To customize the test dataset:
1. Edit `universal_test_dataset.csv`
2. Ensure it includes the data patterns you want to test
3. Update test expectations if needed

## Best Practices

1. **Run Before Deployment**: Always run the full test suite before deploying
2. **Regular Testing**: Run tests after any code changes
3. **Monitor Results**: Check `test_results.json` for automated analysis
4. **Update Tests**: Keep tests updated when adding new features
5. **Environment Consistency**: Use the same test data across environments

## Integration with CI/CD

The test script can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions step
- name: Run DataIQ Tests
  run: |
    cd backend
    python universal_test.py
    
- name: Check Test Results
  run: |
    if [ $(jq '.failed' backend/test_results.json) -gt 0 ]; then
      echo "Tests failed"
      exit 1
    fi
```

This testing system ensures comprehensive coverage of all DataIQ functionalities and provides confidence in the application's reliability.
