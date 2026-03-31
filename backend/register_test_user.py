#!/usr/bin/env python3
"""Register a test user for development"""
import asyncio
import sys
sys.path.insert(0, ".")

from app.core.database import get_db
from app.utils.auth_utils import get_password_hash
from bson import ObjectId
from datetime import datetime

async def register_test_user():
    db = get_db()
    
    # Check if user already exists
    existing = await db.users.find_one({"email": "test@example.com"})
    if existing:
        print("✓ Test user already exists (test@example.com / password123)")
        return
    
    # Hash password
    hashed_password = get_password_hash("password123")
    
    # Create user document
    user_dict = {
        "_id": str(ObjectId()),
        "email": "test@example.com",
        "username": "testuser",
        "first_name": "Test",
        "last_name": "User",
        "phone_number": None,
        "hashed_password": hashed_password,
        "profile_image_url": None,
        "google_id": None,
        "provider": "local",
        "is_active": True,
        "email_verified": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    
    # Insert user
    result = await db.users.insert_one(user_dict)
    print(f"✓ Test user created successfully!")
    print(f"  Email: test@example.com")
    print(f"  Password: password123")
    print(f"  ID: {result.inserted_id}")

if __name__ == "__main__":
    asyncio.run(register_test_user())
