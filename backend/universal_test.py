#!/usr/bin/env python3
"""
Universal Test Script for DataIQ
Tests all modules: Upload, Preview, Analysis, Filters, Missing Values, Data Types, Duplicates, Cleanup
"""

import requests
import json
import os
import time
from typing import Dict, Any, List
import pandas as pd

# Configuration
BASE_URL = "http://localhost:8000"
TEST_FILE = "universal_test_dataset.csv"
TEST_FILE_PATH = os.path.join(os.path.dirname(__file__), TEST_FILE)

class Colors:
    """ANSI color codes for terminal output"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    END = '\033[0m'

class DataIQTester:
    def __init__(self):
        self.session = requests.Session()
        self.uploaded_files = []
        self.test_results = {
            'passed': 0,
            'failed': 0,
            'total': 0,
            'details': []
        }
        
    def log(self, message: str, color: str = Colors.WHITE):
        """Print colored log message"""
        print(f"{color}{message}{Colors.END}")
        
    def log_success(self, message: str):
        """Log success message"""
        self.log(f"✅ {message}", Colors.GREEN)
        
    def log_error(self, message: str):
        """Log error message"""
        self.log(f"❌ {message}", Colors.RED)
        
    def log_info(self, message: str):
        """Log info message"""
        self.log(f"ℹ️  {message}", Colors.BLUE)
        
    def log_warning(self, message: str):
        """Log warning message"""
        self.log(f"⚠️  {message}", Colors.YELLOW)
        
    def record_test(self, test_name: str, passed: bool, details: str = ""):
        """Record test result"""
        self.test_results['total'] += 1
        if passed:
            self.test_results['passed'] += 1
            self.log_success(f"{test_name}: PASSED")
        else:
            self.test_results['failed'] += 1
            self.log_error(f"{test_name}: FAILED - {details}")
            
        self.test_results['details'].append({
            'test': test_name,
            'passed': passed,
            'details': details
        })
        
    def check_server_health(self) -> bool:
        """Test server health endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/health")
            if response.status_code == 200:
                self.record_test("Server Health Check", True)
                return True
            else:
                self.record_test("Server Health Check", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Server Health Check", False, str(e))
            return False
            
    def test_file_upload(self) -> bool:
        """Test file upload functionality"""
        try:
            if not os.path.exists(TEST_FILE_PATH):
                self.record_test("File Upload", False, f"Test file not found: {TEST_FILE_PATH}")
                return False
                
            with open(TEST_FILE_PATH, 'rb') as f:
                files = {'files': (TEST_FILE, f, 'text/csv')}
                response = self.session.post(f"{BASE_URL}/upload", files=files)
                
            if response.status_code == 200:
                data = response.json()
                if 'files' in data and len(data['files']) > 0:
                    self.uploaded_files.extend(data['files'])
                    self.record_test("File Upload", True)
                    return True
                else:
                    self.record_test("File Upload", False, "No files in response")
                    return False
            else:
                self.record_test("File Upload", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("File Upload", False, str(e))
            return False
            
    def test_file_listing(self) -> bool:
        """Test file listing functionality"""
        try:
            response = self.session.get(f"{BASE_URL}/files")
            if response.status_code == 200:
                data = response.json()
                if 'files' in data:
                    self.record_test("File Listing", True)
                    return True
                else:
                    self.record_test("File Listing", False, "No files key in response")
                    return False
            else:
                self.record_test("File Listing", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("File Listing", False, str(e))
            return False
            
    def test_file_preview(self) -> bool:
        """Test file preview functionality"""
        try:
            if not os.path.exists(TEST_FILE_PATH):
                self.record_test("File Preview", False, "Test file not found")
                return False
                
            with open(TEST_FILE_PATH, 'rb') as f:
                files = {'file': (TEST_FILE, f, 'text/csv')}
                response = self.session.post(f"{BASE_URL}/preview", files=files)
                
            if response.status_code == 200:
                data = response.json()
                if 'preview' in data:
                    self.record_test("File Preview", True)
                    return True
                else:
                    self.record_test("File Preview", False, "No preview in response")
                    return False
            else:
                self.record_test("File Preview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("File Preview", False, str(e))
            return False
            
    def test_dataset_analysis(self) -> bool:
        """Test dataset analysis functionality"""
        try:
            if not os.path.exists(TEST_FILE_PATH):
                self.record_test("Dataset Analysis", False, "Test file not found")
                return False
                
            with open(TEST_FILE_PATH, 'rb') as f:
                files = {'file': (TEST_FILE, f, 'text/csv')}
                response = self.session.post(f"{BASE_URL}/analyze", files=files)
                
            if response.status_code == 200:
                data = response.json()
                if 'analysis' in data:
                    self.record_test("Dataset Analysis", True)
                    return True
                else:
                    self.record_test("Dataset Analysis", False, "No analysis in response")
                    return False
            else:
                self.record_test("Dataset Analysis", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Dataset Analysis", False, str(e))
            return False
            
    def test_dataset_info(self) -> bool:
        """Test dataset info endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/dataset-info/{TEST_FILE}")
            if response.status_code == 200:
                data = response.json()
                if 'columns' in data and 'rows' in data:
                    self.record_test("Dataset Info", True)
                    return True
                else:
                    self.record_test("Dataset Info", False, "Missing columns or rows in response")
                    return False
            else:
                self.record_test("Dataset Info", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Dataset Info", False, str(e))
            return False
            
    def test_filters(self) -> bool:
        """Test filtering functionality"""
        try:
            filter_request = {
                "filename": TEST_FILE,
                "filters": {
                    "columns": ["name", "age", "salary", "department"],
                    "range_filters": [
                        {
                            "column": "age",
                            "min_value": 25,
                            "max_value": 35
                        }
                    ]
                },
                "page": 1,
                "page_size": 10
            }
            
            response = self.session.post(f"{BASE_URL}/apply-filters", json=filter_request)
            if response.status_code == 200:
                data = response.json()
                if 'data' in data and 'pagination' in data:
                    self.record_test("Apply Filters", True)
                    return True
                else:
                    self.record_test("Apply Filters", False, "Missing data or pagination in response")
                    return False
            else:
                self.record_test("Apply Filters", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Apply Filters", False, str(e))
            return False
            
    def test_missing_values_preview(self) -> bool:
        """Test missing values preview"""
        try:
            request_data = {
                "filename": TEST_FILE
            }
            
            response = self.session.post(f"{BASE_URL}/api/missing-values/preview", json=request_data)
            if response.status_code == 200:
                data = response.json()
                if 'missing_summary' in data:
                    self.record_test("Missing Values Preview", True)
                    return True
                else:
                    self.record_test("Missing Values Preview", False, "No missing_summary in response")
                    return False
            else:
                self.record_test("Missing Values Preview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Missing Values Preview", False, str(e))
            return False
            
    def test_missing_values_handle(self) -> bool:
        """Test missing values handling"""
        try:
            request_data = {
                "filename": TEST_FILE,
                "action": "drop_rows",
                "columns": ["salary", "join_date"]
            }
            
            response = self.session.post(f"{BASE_URL}/api/missing-values/handle", json=request_data)
            if response.status_code == 200:
                data = response.json()
                if 'rows_affected' in data and 'new_file' in data:
                    self.record_test("Missing Values Handle", True)
                    return True
                else:
                    self.record_test("Missing Values Handle", False, "Missing rows_affected or new_file")
                    return False
            else:
                self.record_test("Missing Values Handle", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Missing Values Handle", False, str(e))
            return False
            
    def test_datatypes_preview(self) -> bool:
        """Test data types preview"""
        try:
            request_data = {
                "filename": TEST_FILE
            }
            
            response = self.session.post(f"{BASE_URL}/api/datatypes/preview", json=request_data)
            if response.status_code == 200:
                data = response.json()
                if 'column_analysis' in data:
                    self.record_test("Data Types Preview", True)
                    return True
                else:
                    self.record_test("Data Types Preview", False, "No column_analysis in response")
                    return False
            else:
                self.record_test("Data Types Preview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Data Types Preview", False, str(e))
            return False
            
    def test_datatypes_convert(self) -> bool:
        """Test data types conversion"""
        try:
            request_data = {
                "filename": TEST_FILE,
                "action": "auto_detect",
                "filter_type": "all"
            }
            
            response = self.session.post(f"{BASE_URL}/api/datatypes/convert", json=request_data)
            if response.status_code == 200:
                data = response.json()
                if 'conversions_applied' in data and 'new_file' in data:
                    self.record_test("Data Types Convert", True)
                    return True
                else:
                    self.record_test("Data Types Convert", False, "Missing conversions_applied or new_file")
                    return False
            else:
                self.record_test("Data Types Convert", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Data Types Convert", False, str(e))
            return False
            
    def test_duplicates_preview(self) -> bool:
        """Test duplicates preview"""
        try:
            request_data = {
                "filename": TEST_FILE
            }
            
            response = self.session.post(f"{BASE_URL}/api/duplicates/preview", json=request_data)
            if response.status_code == 200:
                data = response.json()
                if 'total_rows' in data and 'duplicate_count' in data:
                    self.record_test("Duplicates Preview", True)
                    return True
                else:
                    self.record_test("Duplicates Preview", False, "Missing total_rows or duplicate_count")
                    return False
            else:
                self.record_test("Duplicates Preview", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Duplicates Preview", False, str(e))
            return False
            
    def test_duplicates_handle(self) -> bool:
        """Test duplicates handling"""
        try:
            request_data = {
                "filename": TEST_FILE,
                "action": "keep_first"
            }
            
            response = self.session.post(f"{BASE_URL}/api/duplicates/handle", json=request_data)
            if response.status_code == 200:
                data = response.json()
                if 'rows_affected' in data and 'new_file' in data:
                    self.record_test("Duplicates Handle", True)
                    return True
                else:
                    self.record_test("Duplicates Handle", False, "Missing rows_affected or new_file")
                    return False
            else:
                self.record_test("Duplicates Handle", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Duplicates Handle", False, str(e))
            return False
            
    def test_cleanup_status(self) -> bool:
        """Test cleanup status"""
        try:
            response = self.session.get(f"{BASE_URL}/api/cleanup/status")
            if response.status_code == 200:
                data = response.json()
                if 'uploads_dir' in data:
                    self.record_test("Cleanup Status", True)
                    return True
                else:
                    self.record_test("Cleanup Status", False, "No uploads_dir in response")
                    return False
            else:
                self.record_test("Cleanup Status", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Cleanup Status", False, str(e))
            return False
            
    def test_cleanup_processed_files(self) -> bool:
        """Test cleanup processed files"""
        try:
            response = self.session.post(f"{BASE_URL}/api/cleanup/processed-files")
            if response.status_code == 200:
                data = response.json()
                if 'message' in data:
                    self.record_test("Cleanup Processed Files", True)
                    return True
                else:
                    self.record_test("Cleanup Processed Files", False, "No message in response")
                    return False
            else:
                self.record_test("Cleanup Processed Files", False, f"Status: {response.status_code}")
                return False
        except Exception as e:
            self.record_test("Cleanup Processed Files", False, str(e))
            return False
            
    def run_all_tests(self):
        """Run all tests in sequence"""
        self.log(f"{Colors.BOLD}{Colors.CYAN}🚀 Starting DataIQ Universal Test Suite{Colors.END}")
        self.log(f"{Colors.BOLD}Testing against: {BASE_URL}{Colors.END}")
        self.log(f"{Colors.BOLD}Test dataset: {TEST_FILE}{Colors.END}")
        print("=" * 60)
        
        # Test sequence
        tests = [
            ("Server Health", self.check_server_health),
            ("File Upload", self.test_file_upload),
            ("File Listing", self.test_file_listing),
            ("File Preview", self.test_file_preview),
            ("Dataset Analysis", self.test_dataset_analysis),
            ("Dataset Info", self.test_dataset_info),
            ("Apply Filters", self.test_filters),
            ("Missing Values Preview", self.test_missing_values_preview),
            ("Missing Values Handle", self.test_missing_values_handle),
            ("Data Types Preview", self.test_datatypes_preview),
            ("Data Types Convert", self.test_datatypes_convert),
            ("Duplicates Preview", self.test_duplicates_preview),
            ("Duplicates Handle", self.test_duplicates_handle),
            ("Cleanup Status", self.test_cleanup_status),
            ("Cleanup Processed Files", self.test_cleanup_processed_files),
        ]
        
        for test_name, test_func in tests:
            self.log_info(f"Running: {test_name}")
            try:
                test_func()
                time.sleep(0.5)  # Small delay between tests
            except Exception as e:
                self.record_test(test_name, False, f"Unexpected error: {str(e)}")
            print("-" * 40)
            
        # Print summary
        self.print_summary()
        
    def print_summary(self):
        """Print test summary"""
        print("=" * 60)
        self.log(f"{Colors.BOLD}{Colors.CYAN}📊 TEST SUMMARY{Colors.END}")
        print("=" * 60)
        
        total = self.test_results['total']
        passed = self.test_results['passed']
        failed = self.test_results['failed']
        success_rate = (passed / total * 100) if total > 0 else 0
        
        self.log(f"{Colors.BOLD}Total Tests: {total}{Colors.END}")
        self.log_success(f"Passed: {passed}")
        if failed > 0:
            self.log_error(f"Failed: {failed}")
        else:
            self.log_success(f"Failed: {failed}")
        
        if success_rate == 100:
            self.log(f"{Colors.BOLD}{Colors.GREEN}Success Rate: {success_rate:.1f}% 🎉{Colors.END}")
        elif success_rate >= 80:
            self.log(f"{Colors.BOLD}{Colors.YELLOW}Success Rate: {success_rate:.1f}% ⚠️{Colors.END}")
        else:
            self.log(f"{Colors.BOLD}{Colors.RED}Success Rate: {success_rate:.1f}% ❌{Colors.END}")
            
        # Print failed tests details
        if failed > 0:
            print("\n" + "=" * 60)
            self.log_error("FAILED TESTS DETAILS:")
            print("=" * 60)
            for result in self.test_results['details']:
                if not result['passed']:
                    self.log_error(f"❌ {result['test']}: {result['details']}")
                    
        print("=" * 60)
        
        # Save results to file
        self.save_results()
        
    def save_results(self):
        """Save test results to JSON file"""
        try:
            results_file = "test_results.json"
            with open(results_file, 'w') as f:
                json.dump(self.test_results, f, indent=2)
            self.log_info(f"Test results saved to: {results_file}")
        except Exception as e:
            self.log_warning(f"Could not save results: {str(e)}")

def main():
    """Main function"""
    tester = DataIQTester()
    
    # Check if test file exists
    if not os.path.exists(TEST_FILE_PATH):
        tester.log_error(f"Test dataset not found: {TEST_FILE_PATH}")
        tester.log_info("Please ensure the universal_test_dataset.csv file exists in the same directory")
        return
        
    # Run all tests
    tester.run_all_tests()

if __name__ == "__main__":
    main()
