from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import RedirectResponse
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from authlib.integrations.starlette_client import OAuth
import os
from bson import ObjectId
from datetime import datetime
import urllib.parse

from app.models.user_model import (
    UserCreate, UserLogin, UserResponse, Token, 
    GoogleAuthRequest, GoogleAuthResponse, RefreshTokenRequest,
    ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest
)
from app.utils.auth_utils import (
    get_password_hash, verify_password, create_tokens,
    verify_token, get_current_active_user
)
from app.core.database import get_db

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8001")

# Initialize OAuth
oauth = OAuth()
oauth.register(
    name='google',
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """Register a new user with email and password"""
    db = get_db()
    
    # Check if user already exists
    existing_user = await db.users.find_one({
        "$or": [
            {"email": user_data.email},
            {"username": user_data.username}
        ]
    })
    
    if existing_user:
        if existing_user.get("email") == user_data.email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken"
            )
    
    # Hash password
    hashed_password = get_password_hash(user_data.password)
    
    # Create user document
    user_dict = {
        "_id": str(ObjectId()),
        "email": user_data.email,
        "username": user_data.username,
        "first_name": user_data.first_name,
        "last_name": user_data.last_name,
        "phone_number": user_data.phone_number,
        "hashed_password": hashed_password,
        "profile_image_url": None,
        "google_id": None,
        "provider": "local",
        "is_active": True,
        "is_verified": False,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    # Insert user into database
    await db.users.insert_one(user_dict)
    
    # Create tokens
    tokens = create_tokens(user_dict["_id"], user_dict["email"])
    
    # Return user data without password
    user_response = {
        "_id": user_dict["_id"],
        "email": user_dict["email"],
        "username": user_dict["username"],
        "first_name": user_dict["first_name"],
        "last_name": user_dict["last_name"],
        "phone_number": user_dict["phone_number"],
        "profile_image_url": user_dict["profile_image_url"],
        "provider": user_dict["provider"],
        "is_active": user_dict["is_active"],
        "is_verified": user_dict["is_verified"],
        "created_at": user_dict["created_at"]
    }
    
    return {
        "message": "User registered successfully",
        "user": user_response,
        **tokens
    }


@router.post("/login", response_model=dict)
async def login(user_credentials: UserLogin):
    """Login with email/username and password"""
    db = get_db()
    
    # Find user by email or username
    query = {}
    if user_credentials.email:
        query["email"] = user_credentials.email
    elif user_credentials.username:
        query["username"] = user_credentials.username
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username is required"
        )
    
    user = await db.users.find_one(query)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Verify password
    if not verify_password(user_credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    
    # Create tokens
    tokens = create_tokens(user["_id"], user["email"])
    
    # Prepare user response
    user_response = {
        "_id": user["_id"],
        "email": user["email"],
        "username": user["username"],
        "first_name": user.get("first_name"),
        "last_name": user.get("last_name"),
        "phone_number": user.get("phone_number"),
        "profile_image_url": user.get("profile_image_url"),
        "provider": user.get("provider", "local"),
        "is_active": user.get("is_active", True),
        "is_verified": user.get("is_verified", False),
        "created_at": user.get("created_at")
    }
    
    return {
        "message": "Login successful",
        "user": user_response,
        **tokens
    }


@router.post("/google", response_model=dict)
async def google_auth(auth_request: GoogleAuthRequest):
    """Authenticate with Google OAuth ID token"""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth not configured"
        )
    
    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(
            auth_request.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID
        )
        
        # Extract user information
        email = idinfo.get("email")
        google_id = idinfo.get("sub")
        first_name = idinfo.get("given_name", "")
        last_name = idinfo.get("family_name", "")
        profile_image = idinfo.get("picture", "")
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not provided by Google"
            )
        
        db = get_db()
        
        # Check if user exists
        user = await db.users.find_one({"email": email})
        
        if user:
            # Update Google ID if not set
            if not user.get("google_id"):
                await db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {"google_id": google_id, "updated_at": datetime.utcnow()}}
                )
                user["google_id"] = google_id
        else:
            # Create new user
            username = email.split("@")[0]
            
            # Ensure unique username
            base_username = username
            counter = 1
            while await db.users.find_one({"username": username}):
                username = f"{base_username}{counter}"
                counter += 1
            
            user_dict = {
                "_id": str(ObjectId()),
                "email": email,
                "username": username,
                "first_name": first_name,
                "last_name": last_name,
                "phone_number": None,
                "hashed_password": get_password_hash(str(ObjectId())),  # Random password
                "profile_image_url": profile_image,
                "google_id": google_id,
                "provider": "google",
                "is_active": True,
                "is_verified": True,  # Google accounts are pre-verified
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await db.users.insert_one(user_dict)
            user = user_dict
        
        # Create tokens
        tokens = create_tokens(user["_id"], user["email"])
        
        # Prepare user response
        user_response = {
            "_id": user["_id"],
            "email": user["email"],
            "username": user["username"],
            "first_name": user.get("first_name"),
            "last_name": user.get("last_name"),
            "phone_number": user.get("phone_number"),
            "profile_image_url": user.get("profile_image_url"),
            "provider": user.get("provider", "google"),
            "is_active": user.get("is_active", True),
            "is_verified": user.get("is_verified", True),
            "created_at": user.get("created_at")
        }
        
        return {
            "message": "Google authentication successful",
            "user": user_response,
            **tokens
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )


@router.post("/refresh", response_model=Token)
async def refresh_access_token(refresh_request: RefreshTokenRequest):
    """Refresh access token using refresh token"""
    try:
        # Verify refresh token
        token_data = verify_token(refresh_request.refresh_token, "refresh")
        
        # Create new tokens
        tokens = create_tokens(token_data.user_id, token_data.email)
        
        return Token(**tokens)
        
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user = Depends(get_current_active_user)):
    """Get current user information"""
    return UserResponse(
        _id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        phone_number=current_user.phone_number,
        profile_image_url=current_user.profile_image_url,
        provider=current_user.provider,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at
    )


@router.post("/logout")
async def logout(current_user = Depends(get_current_active_user)):
    """Logout current user"""
    # In a production app, you might want to blacklist the token here
    return {"message": "Logout successful"}


@router.post("/change-password")
async def change_password(
    password_data: ChangePasswordRequest,
    current_user = Depends(get_current_active_user)
):
    """Change user password"""
    db = get_db()
    
    # Verify old password
    user = await db.users.find_one({"_id": current_user.id})
    if not verify_password(password_data.old_password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )
    
    # Update password
    new_hashed_password = get_password_hash(password_data.new_password)
    await db.users.update_one(
        {"_id": current_user.id},
        {"$set": {
            "hashed_password": new_hashed_password,
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {"message": "Password changed successfully"}


@router.get("/google/login")
async def google_login(request: Request):
    """Redirect to Google OAuth login"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET"
        )
    
    redirect_uri = f"{BACKEND_URL}/api/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@router.get("/google/callback")
async def google_callback(request: Request):
    """Handle Google OAuth callback"""
    try:
        # Get token from Google
        token = await oauth.google.authorize_access_token(request)
        
        # Get user info from token
        user_info = token.get('userinfo')
        if not user_info:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to get user info from Google"
            )
        
        email = user_info.get('email')
        google_id = user_info.get('sub')
        first_name = user_info.get('given_name', '')
        last_name = user_info.get('family_name', '')
        profile_image = user_info.get('picture', '')
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not provided by Google"
            )
        
        db = get_db()
        
        # Check if user exists
        user = await db.users.find_one({"email": email})
        
        if user:
            # Update Google ID and profile image if not set and mark provider
            update_data = {"updated_at": datetime.utcnow()}
            if not user.get("google_id"):
                update_data["google_id"] = google_id
            # Always set provider to google for this auth path
            if user.get("provider") != "google":
                update_data["provider"] = "google"
            if profile_image:
                update_data["profile_image_url"] = profile_image
            # Backfill names if missing
            if first_name and not user.get("first_name"):
                update_data["first_name"] = first_name
            if last_name and not user.get("last_name"):
                update_data["last_name"] = last_name
            
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": update_data}
            )
            user.update(update_data)
        else:
            # Create new user
            username = email.split("@")[0]
            
            # Ensure unique username
            base_username = username
            counter = 1
            while await db.users.find_one({"username": username}):
                username = f"{base_username}{counter}"
                counter += 1
            
            user_dict = {
                "_id": str(ObjectId()),
                "email": email,
                "username": username,
                "first_name": first_name,
                "last_name": last_name,
                "phone_number": None,
                "hashed_password": get_password_hash(str(ObjectId())),  # Random password
                "profile_image_url": profile_image,
                "google_id": google_id,
                "provider": "google",
                "is_active": True,
                "is_verified": True,  # Google accounts are pre-verified
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            await db.users.insert_one(user_dict)
            user = user_dict
        
        # Create tokens
        tokens = create_tokens(user["_id"], user["email"])
        
        # Redirect to frontend with tokens
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]
        
        # URL encode the tokens
        params = urllib.parse.urlencode({
            'access_token': access_token,
            'refresh_token': refresh_token,
            'user': user["_id"]
        })
        
        # Redirect to frontend success page with tokens in URL
        redirect_url = f"{FRONTEND_URL}/auth/callback?{params}"
        return RedirectResponse(url=redirect_url)
        
    except Exception as e:
        print(f"❌ Google OAuth error: {str(e)}")
        # Redirect to frontend with error
        error_params = urllib.parse.urlencode({'error': str(e)})
        return RedirectResponse(url=f"{FRONTEND_URL}/login?{error_params}")