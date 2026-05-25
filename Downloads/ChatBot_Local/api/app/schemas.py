from typing import Optional, Any, Dict, List, Literal
from pydantic import BaseModel, Field


class CheckUsernameRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)


class CheckUsernameResponse(BaseModel):
    available: bool


class ResolveUsernameRequest(BaseModel):
    username: str = Field(min_length=3, max_length=30)


class ResolveUsernameResponse(BaseModel):
    email: str


class ChatCreateResponse(BaseModel):
    chatId: str


class ChatRenameRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)


class ChatMessageRequest(BaseModel):
    chatId: str
    message: str = Field(min_length=1, max_length=8000)
    activeDocumentId: Optional[str] = None


class MessageFeedbackRequest(BaseModel):
    value: Literal["up", "down"]


class DocumentResponse(BaseModel):
    documentId: str
    fileName: str
    localPath: Optional[str] = None
    embeddingStatus: str
    summary: Optional[str] = ""
    pageCount: Optional[int] = 0
    fileSize: Optional[int] = 0


class ChatMessageResponse(BaseModel):
    messageId: str
    answer: str
    route: str
    reasoningTrace: Dict[str, Any]
    tokenUsage: Dict[str, Any]
    retrievedChunks: List[Dict[str, Any]] = []
