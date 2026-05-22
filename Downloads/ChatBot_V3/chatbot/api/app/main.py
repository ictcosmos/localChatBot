import os
from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import firestore

from app.config import db, bucket
from app.auth import get_current_uid
from app.schemas import (
    CheckUsernameRequest, CheckUsernameResponse,
    ResolveUsernameRequest, ResolveUsernameResponse,
    ChatCreateRequest, ChatRenameRequest, ChatResponse,
    MessageResponse, ChatMessageRequest,
    DocumentProcessRequest, DocumentResponse
)
from app.document_processor import process_document_background
from app.vector_store import get_collection

app = FastAPI(title="Local Hybrid AI Chatbot Backend", version="2.0.0")

# Enable CORS restricted strictly to http://localhost:3000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def to_iso_string(val) -> str:
    """Helper to safely format Firestore timestamp values to ISO 8601 strings."""
    if not val:
        return ""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)

# --- Authentication Helpers & User Endpoints ---

@app.post("/auth/check-username", response_model=CheckUsernameResponse)
async def check_username(payload: CheckUsernameRequest):
    """
    Checks if a username is available across the platform.
    Runs server-side with Admin privileges.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    users_ref = db.collection("users")
    query = users_ref.where("username", "==", payload.username).limit(1).get()
    
    return CheckUsernameResponse(available=len(query) == 0)

@app.post("/auth/resolve-username", response_model=ResolveUsernameResponse)
async def resolve_username(payload: ResolveUsernameRequest):
    """
    Resolves a username to their corresponding email for sign-in lookup.
    Runs server-side to prevent exposing full user subtrees directly to clients.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    users_ref = db.collection("users")
    query = users_ref.where("username", "==", payload.username).limit(1).get()
    
    if not query:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Username not found.")
    
    user_data = query[0].to_dict()
    email = user_data.get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not configured for user.")
    
    return ResolveUsernameResponse(email=email)

# --- Chat Operations ---

@app.get("/chats", response_model=list[ChatResponse])
async def get_chats(uid: str = Depends(get_current_uid)):
    """
    Fetch all chats for the authenticated user, sorted by updatedAt descending.
    Limits to the 50 most recent chats.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    chats_ref = db.collection("users").document(uid).collection("chats")
    chats = chats_ref.order_by("updatedAt", direction=firestore.Query.DESCENDING).limit(50).get()
    
    result = []
    for chat in chats:
        data = chat.to_dict()
        result.append(ChatResponse(
            chatId=data.get("chatId", chat.id),
            title=data.get("title", "New Chat"),
            activeDocumentId=data.get("activeDocumentId"),
            createdAt=to_iso_string(data.get("createdAt")),
            updatedAt=to_iso_string(data.get("updatedAt")),
            lastMessage=data.get("lastMessage")
        ))
    return result

@app.post("/chats", response_model=ChatResponse)
async def create_chat(payload: ChatCreateRequest, uid: str = Depends(get_current_uid)):
    """
    Create a new empty chat session with a default title.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    chat_ref = db.collection("users").document(uid).collection("chats").document()
    chat_id = chat_ref.id
    
    chat_data = {
        "chatId": chat_id,
        "title": payload.title or "New Chat",
        "activeDocumentId": None,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "lastMessage": None
    }
    
    chat_ref.set(chat_data)
    
    snap = chat_ref.get()
    snap_data = snap.to_dict() or chat_data
    
    return ChatResponse(
        chatId=chat_id,
        title=snap_data.get("title"),
        activeDocumentId=snap_data.get("activeDocumentId"),
        createdAt=to_iso_string(snap_data.get("createdAt")),
        updatedAt=to_iso_string(snap_data.get("updatedAt")),
        lastMessage=snap_data.get("lastMessage")
    )

@app.patch("/chats/{chatId}", response_model=ChatResponse)
async def rename_chat(chatId: str, payload: ChatRenameRequest, uid: str = Depends(get_current_uid)):
    """
    Rename an existing chat session.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    chat_ref = db.collection("users").document(uid).collection("chats").document(chatId)
    snap = chat_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Chat not found.")
    
    chat_ref.update({
        "title": payload.title,
        "updatedAt": firestore.SERVER_TIMESTAMP
    })
    
    updated_snap = chat_ref.get()
    updated_data = updated_snap.to_dict()
    
    return ChatResponse(
        chatId=chatId,
        title=updated_data.get("title"),
        activeDocumentId=updated_data.get("activeDocumentId"),
        createdAt=to_iso_string(updated_data.get("createdAt")),
        updatedAt=to_iso_string(updated_data.get("updatedAt")),
        lastMessage=updated_data.get("lastMessage")
    )

@app.delete("/chats/{chatId}")
async def delete_chat(chatId: str, uid: str = Depends(get_current_uid)):
    """
    Delete a chat session and all messages contained within in a batch transaction.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    chat_ref = db.collection("users").document(uid).collection("chats").document(chatId)
    chat_snap = chat_ref.get()
    if not chat_snap.exists:
        raise HTTPException(status_code=404, detail="Chat not found.")
    
    messages_ref = chat_ref.collection("messages")
    messages = messages_ref.get()
    
    batch = db.batch()
    batch.delete(chat_ref)
    for msg in messages:
        batch.delete(msg.reference)
    
    batch.commit()
    
    return {"message": "Chat and its associated messages deleted successfully."}

@app.get("/chats/{chatId}/messages", response_model=list[MessageResponse])
async def get_chat_messages(chatId: str, uid: str = Depends(get_current_uid)):
    """
    Retrieve message history for a specific chat, ordered oldest first, limited to 100.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    chat_ref = db.collection("users").document(uid).collection("chats").document(chatId)
    chat_snap = chat_ref.get()
    if not chat_snap.exists:
        raise HTTPException(status_code=404, detail="Chat not found.")
    
    messages_ref = chat_ref.collection("messages")
    messages = messages_ref.order_by("createdAt", direction=firestore.Query.ASCENDING).limit(100).get()
    
    result = []
    for msg in messages:
        data = msg.to_dict()
        result.append(MessageResponse(
            messageId=data.get("messageId", msg.id),
            role=data.get("role"),
            content=data.get("content", ""),
            route=data.get("route"),
            createdAt=to_iso_string(data.get("createdAt")),
            tokenUsage=data.get("tokenUsage"),
            reasoningTrace=data.get("reasoningTrace"),
            documentId=data.get("documentId"),
            retrievedChunks=data.get("retrievedChunks"),
            feedback=data.get("feedback")
        ))
    return result

# --- Document Handling & Vectorization Endpoints ---

@app.post("/documents/process", status_code=202)
async def process_document(
    payload: DocumentProcessRequest, 
    background_tasks: BackgroundTasks,
    uid: str = Depends(get_current_uid)
):
    """
    Starts async document parsing, chunking, and Chroma DB ingestion.
    Validates file details against Cloud Storage metadata before queuing.
    """
    if db is None or bucket is None:
        raise HTTPException(status_code=503, detail="Database/Storage unavailable.")
        
    # Server-side final guards: extension verification
    suffix = os.path.splitext(payload.fileName)[1].lower()
    if suffix not in [".pdf", ".docx", ".txt"]:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {suffix}")
        
    # Verify file existence and size in Cloud Storage
    blob = bucket.get_blob(payload.storagePath)
    if not blob:
        raise HTTPException(status_code=404, detail="Uploaded file not found in Storage.")
        
    # Enforce maximum size of 20MB
    if blob.size > 20 * 1024 * 1024:
        # Delete file from storage as it exceeds guidelines
        blob.delete()
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 20 MB.")
        
    # Create or update document metadata state in Firestore
    doc_ref = db.collection("users").document(uid).collection("documents").document(payload.documentId)
    
    doc_data = {
        "documentId": payload.documentId,
        "fileName": payload.fileName,
        "fileUrl": blob.public_url,
        "storagePath": payload.storagePath,
        "vectorCollectionName": "documents",
        "uploadedAt": firestore.SERVER_TIMESTAMP,
        "embeddingStatus": "pending",
        "summary": None,
        "pageCount": None,
        "fileSize": blob.size
    }
    doc_ref.set(doc_data)
    
    # Spawn background ingestion thread
    background_tasks.add_task(
        process_document_background,
        uid=uid,
        document_id=payload.documentId,
        file_name=payload.fileName,
        storage_path=payload.storagePath,
        chat_id=payload.chatId
    )
    
    return {"message": "Document ingestion queued.", "documentId": payload.documentId}

@app.get("/documents/{documentId}", response_model=DocumentResponse)
async def get_document_status(documentId: str, uid: str = Depends(get_current_uid)):
    """
    Fetches the status and metadata of a specific document.
    Used for client status polling.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
        
    doc_ref = db.collection("users").document(uid).collection("documents").document(documentId)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    data = snap.to_dict()
    return DocumentResponse(
        documentId=data.get("documentId"),
        fileName=data.get("fileName"),
        fileUrl=data.get("fileUrl"),
        storagePath=data.get("storagePath"),
        vectorCollectionName=data.get("vectorCollectionName"),
        uploadedAt=to_iso_string(data.get("uploadedAt")),
        embeddingStatus=data.get("embeddingStatus", "pending"),
        summary=data.get("summary"),
        pageCount=data.get("pageCount"),
        fileSize=data.get("fileSize")
    )

@app.get("/documents", response_model=list[DocumentResponse])
async def list_documents(uid: str = Depends(get_current_uid)):
    """
    Lists all documents uploaded by the authenticated user, sorted by upload date.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
        
    docs = db.collection("users").document(uid).collection("documents").order_by("uploadedAt", direction=firestore.Query.DESCENDING).get()
    
    result = []
    for doc in docs:
        data = doc.to_dict()
        result.append(DocumentResponse(
            documentId=data.get("documentId"),
            fileName=data.get("fileName"),
            fileUrl=data.get("fileUrl"),
            storagePath=data.get("storagePath"),
            vectorCollectionName=data.get("vectorCollectionName"),
            uploadedAt=to_iso_string(data.get("uploadedAt")),
            embeddingStatus=data.get("embeddingStatus", "pending"),
            summary=data.get("summary"),
            pageCount=data.get("pageCount"),
            fileSize=data.get("fileSize")
        ))
    return result

@app.delete("/documents/{documentId}")
async def delete_document(documentId: str, uid: str = Depends(get_current_uid)):
    """
    Completely purges a document.
    Wipes Firestore document reference, purges Firebase Storage binary,
    and removes all associated vectors in local Chroma index.
    """
    if db is None or bucket is None:
        raise HTTPException(status_code=503, detail="Database/Storage unavailable.")
        
    doc_ref = db.collection("users").document(uid).collection("documents").document(documentId)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Document metadata not found.")
        
    data = snap.to_dict()
    storage_path = data.get("storagePath")
    
    # 1. Delete file from Storage
    if storage_path:
        try:
            blob = bucket.blob(storage_path)
            if blob.exists():
                blob.delete()
        except Exception as e:
            print(f"[Purge Error] Failed to delete blob: {e}")
            
    # 2. Delete vectors from Chroma DB
    try:
        chroma_collection = get_collection()
        # Delete vectors matching uid and documentId
        chroma_collection.delete(
            where={
                "$and": [
                    {"uid": {"$eq": uid}},
                    {"documentId": {"$eq": documentId}}
                ]
            }
        )
        print(f"[Purge] Vectors for {documentId} purged from Chroma successfully.")
    except Exception as e:
        print(f"[Purge Error] Failed to delete Chroma vectors: {e}")
        
    # 3. Delete Firestore document reference
    doc_ref.delete()
    
    return {"message": "Document successfully purged from Firestore, Storage, and Chroma."}

@app.post("/documents/{documentId}/retry", status_code=202)
async def retry_document_processing(
    documentId: str,
    background_tasks: BackgroundTasks,
    uid: str = Depends(get_current_uid)
):
    """
    Resets failed document state and queues parsing again.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
        
    doc_ref = db.collection("users").document(uid).collection("documents").document(documentId)
    snap = doc_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    data = snap.to_dict()
    
    doc_ref.update({
        "embeddingStatus": "pending",
        "summary": None,
        "pageCount": None
    })
    
    # Re-trigger pipeline
    background_tasks.add_task(
        process_document_background,
        uid=uid,
        document_id=documentId,
        file_name=data.get("fileName"),
        storage_path=data.get("storagePath"),
        # Fallback chat ID: query list or set default
        chat_id=""
    )
    
    return {"message": "Ingestion task re-queued successfully."}

# --- Phase 1 Placeholder: Chat Echo Endpoint ---

@app.post("/chat/echo", response_model=MessageResponse)
async def chat_echo(payload: ChatMessageRequest, uid: str = Depends(get_current_uid)):
    """
    Temporary Phase 1 endpoint that echoes the incoming message.
    Updates Firestore and logs appropriate fields.
    """
    if db is None:
        raise HTTPException(status_code=503, detail="Firestore is unavailable.")
    
    chat_ref = db.collection("users").document(uid).collection("chats").document(payload.chatId)
    chat_snap = chat_ref.get()
    if not chat_snap.exists:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    
    # 1. Write the User's Message
    user_msg_ref = chat_ref.collection("messages").document()
    user_msg_id = user_msg_ref.id
    user_msg_data = {
        "messageId": user_msg_id,
        "role": "user",
        "content": payload.message,
        "createdAt": firestore.SERVER_TIMESTAMP
    }
    user_msg_ref.set(user_msg_data)
    
    # 2. Write the Echo Assistant Response
    assistant_msg_ref = chat_ref.collection("messages").document()
    assistant_msg_id = assistant_msg_ref.id
    assistant_msg_data = {
        "messageId": assistant_msg_id,
        "role": "assistant",
        "content": f"Echo: {payload.message}",
        "route": "gemini",
        "createdAt": firestore.SERVER_TIMESTAMP,
        "tokenUsage": {"inputTokens": 10, "outputTokens": 12, "totalTokens": 22},
        "reasoningTrace": {
            "route": "gemini",
            "reason": "Phase 1 Echo Placeholder",
            "confidence": 1.0
        },
        "documentId": payload.activeDocumentId,
        "retrievedChunks": None,
        "feedback": None
    }
    assistant_msg_ref.set(assistant_msg_data)
    
    # 3. Update the Chat summary metadata
    chat_ref.update({
        "lastMessage": f"Echo: {payload.message}",
        "updatedAt": firestore.SERVER_TIMESTAMP
    })
    
    snap = assistant_msg_ref.get()
    snap_data = snap.to_dict() or assistant_msg_data
    
    return MessageResponse(
        messageId=assistant_msg_id,
        role=snap_data.get("role"),
        content=snap_data.get("content"),
        route=snap_data.get("route"),
        createdAt=to_iso_string(snap_data.get("createdAt")),
        tokenUsage=snap_data.get("tokenUsage"),
        reasoningTrace=snap_data.get("reasoningTrace"),
        documentId=snap_data.get("documentId"),
        retrievedChunks=snap_data.get("retrievedChunks"),
        feedback=snap_data.get("feedback")
    )
