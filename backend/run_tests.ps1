# DataIQ Universal Test Runner
# This script runs the comprehensive test suite for all DataIQ modules

Write-Host "🚀 DataIQ Universal Test Runner" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan

# Check if Python is available
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✅ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python not found. Please install Python first." -ForegroundColor Red
    exit 1
}

# Check if required packages are installed
Write-Host "📦 Checking required packages..." -ForegroundColor Yellow
$packages = @("requests", "pandas")

foreach ($package in $packages) {
    try {
        python -c "import $package" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $package is installed" -ForegroundColor Green
        } else {
            Write-Host "❌ $package not found. Installing..." -ForegroundColor Yellow
            pip install $package
        }
    } catch {
        Write-Host "❌ Error checking $package" -ForegroundColor Red
    }
}

# Check if server is running
Write-Host "🔍 Checking if DataIQ server is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -Method GET -TimeoutSec 5 2>$null
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ DataIQ server is running on http://localhost:8000" -ForegroundColor Green
    } else {
        Write-Host "❌ Server responded with status: $($response.StatusCode)" -ForegroundColor Red
        Write-Host "Please start the DataIQ server first using: ./run.ps1" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ DataIQ server is not running or not accessible" -ForegroundColor Red
    Write-Host "Please start the DataIQ server first using: ./run.ps1" -ForegroundColor Yellow
    Write-Host "Make sure it's running on http://localhost:8000" -ForegroundColor Yellow
    exit 1
}

# Run the tests
Write-Host "🧪 Running Universal Test Suite..." -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

try {
    python universal_test.py
    Write-Host "`n✅ Test execution completed!" -ForegroundColor Green
    
    # Check if results file was created
    if (Test-Path "test_results.json") {
        Write-Host "📊 Test results saved to: test_results.json" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Error running tests: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎯 Test run finished. Check the output above for detailed results." -ForegroundColor Cyan
