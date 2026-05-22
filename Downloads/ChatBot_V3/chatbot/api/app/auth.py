from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth

security = HTTPBearer()

def get_current_uid(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Dependency that extracts the Bearer token from the Authorization header,
    verifies it with Firebase Admin SDK, and returns the authenticated user's UID.
    If the token is invalid or expired, raises a 401 Unauthorized exception.
    """
    token = credentials.credentials
    try:
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token.get("uid")
        if not uid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token verified but no UID found.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return uid
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired Firebase ID token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
