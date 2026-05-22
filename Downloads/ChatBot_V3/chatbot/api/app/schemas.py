from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# Auth schemas
class CheckUsernameRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)

class CheckUsernameResponse(BaseModel):
    available: bool

class ResolveUsernameRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)

class ResolveUsernameResponse(BaseModel):
    email: str

# Chat schemas
class ChatCreateRequest(BaseModel):
    title: Optional[str] = "New Chat"

class ChatRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)

class ChatResponse(BaseModel):
    chatId: str
    title: str
    activeDocumentId: Optional[str] = None
    createdAt: str
    updatedAt: str
    lastMessage: Optional[str] = None

class MessageFeedbackRequest(BaseModel):
    value: str = Field(..., pattern="^(up|down)$")

class MessageResponse(BaseModel):
    messageId: str
    role: str
    content: str
    route: Optional[str] = None
    createdAt: str
    tokenUsage: Optional[Dict[str, int]] = None
    reasoningTrace: Optional[Dict[str, Any]] = None
    documentId: Optional[str] = None
    retrievedChunks: Optional[List[Dict[str, Any]]] = None
    feedback: Optional[str] = None

class ChatMessageRequest(BaseModel):
    chatId: str
    message: str = Field(..., max_length=8000)
    activeDocumentId: Optional[str] = None

# Document schemas
class DocumentProcessRequest(BaseModel):
    documentId: str
    fileName: str
    storagePath: str
    chatId: str

class DocumentResponse(BaseModel):
    documentId: str
    fileName: str
    fileUrl: Optional[str] = None
    storagePath: str
    vectorCollectionName: Optional[str] = None
    uploadedAt: str
    embeddingStatus: str
    summary: Optional[str] = None
    pageCount: Optional[int] = None
    fileSize: Optional[int] = None
