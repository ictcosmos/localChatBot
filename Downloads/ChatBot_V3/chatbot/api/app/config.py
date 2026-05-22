import os
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, firestore, storage

# Base Path
BASE_DIR = Path(__file__).resolve().parent.parent

# Env vars
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GOOGLE_CSE_ID = os.environ.get("GOOGLE_CSE_ID")
GOOGLE_CSE_KEY = os.environ.get("GOOGLE_CSE_KEY")
FIREBASE_STORAGE_BUCKET = os.environ.get("FIREBASE_STORAGE_BUCKET")

# Initialize Firebase Admin SDK
SERVICE_ACCOUNT_PATH = BASE_DIR / "service-account.json"

if not firebase_admin._apps:
    if SERVICE_ACCOUNT_PATH.exists():
        cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
        firebase_admin.initialize_app(cred, {
            "storageBucket": FIREBASE_STORAGE_BUCKET
        })
    else:
        # Fallback to default credentials if file doesn't exist yet (for local development startup check)
        try:
            firebase_admin.initialize_app()
        except Exception:
            # Let it fail gracefully or log a message
            print("WARNING: Firebase Admin SDK not initialized: service-account.json is missing.")

# Firestore client and storage bucket references
try:
    db = firestore.client()
except Exception:
    db = None
    print("WARNING: Firestore client failed to initialize.")

try:
    bucket = storage.bucket()
except Exception:
    bucket = None
    print("WARNING: Storage bucket failed to initialize.")
