import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import firestore

from app.auth import get_current_uid
from app.config import db, UPLOAD_DIR
from app.schemas import (
    CheckUsernameRequest,
    CheckUsernameResponse,
    ResolveUsernameRequest,
    ResolveUsernameResponse,
    ChatCreateResponse,
    ChatRenameRequest,
    ChatMessageRequest,
    MessageFeedbackRequest,
)
from app.document_processor import process_document_background
from app.vector_store import delete_document_vectors
from app.router import classify_route
from app.prompts import TECHNICAL_PROMPT, RAG_PROMPT, GOOGLE_SEARCH_PROMPT
from app.tools.chat_history_tool import (
    chat_history_tool,
    get_previous_assistant_route,
    format_chat_history,
)
from app.tools.rag_tool import rag_tool, format_rag_chunks, preview_chunks
from app.tools.gemini_tool import generate_gemini_response
from app.tools.google_search_tool import google_search_tool, format_search_results
from app.tools.reasoning_trace_tool import reasoning_trace_tool

app = FastAPI(title="Local Hybrid AI Chatbot", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Local Hybrid AI Chatbot API is running"}


@app.post("/auth/check-username", response_model=CheckUsernameResponse)
def check_username(payload: CheckUsernameRequest):
    username = payload.username.lower().strip()

    docs = (
        db.collection("users")
        .where("username", "==", username)
        .limit(1)
        .stream()
    )

    exists = any(True for _ in docs)
    return {"available": not exists}


@app.post("/auth/resolve-username", response_model=ResolveUsernameResponse)
def resolve_username(payload: ResolveUsernameRequest):
    username = payload.username.lower().strip()

    docs = (
        db.collection("users")
        .where("username", "==", username)
        .limit(1)
        .stream()
    )

    for doc in docs:
        data = doc.to_dict()
        return {"email": data["email"]}

    raise HTTPException(status_code=404, detail="Username not found")


@app.get("/chats")
def get_chats(current_uid: str = Depends(get_current_uid)):
    docs = (
        db.collection("users")
        .document(current_uid)
        .collection("chats")
        .order_by("updatedAt", direction=firestore.Query.DESCENDING)
        .limit(50)
        .stream()
    )

    chats = []
    for doc in docs:
        data = doc.to_dict() or {}
        chats.append(data)

    return chats


@app.post("/chats", response_model=ChatCreateResponse)
def create_chat(current_uid: str = Depends(get_current_uid)):
    chat_ref = (
        db.collection("users")
        .document(current_uid)
        .collection("chats")
        .document()
    )

    chat_ref.set({
        "chatId": chat_ref.id,
        "title": "New Chat",
        "activeDocumentId": None,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "lastMessage": "",
    })

    return {"chatId": chat_ref.id}


@app.patch("/chats/{chat_id}")
def rename_chat(
    chat_id: str,
    payload: ChatRenameRequest,
    current_uid: str = Depends(get_current_uid),
):
    chat_ref = (
        db.collection("users")
        .document(current_uid)
        .collection("chats")
        .document(chat_id)
    )

    if not chat_ref.get().exists:
        raise HTTPException(status_code=404, detail="Chat not found")

    chat_ref.update({
        "title": payload.title,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    return {"success": True}


@app.delete("/chats/{chat_id}")
def delete_chat(chat_id: str, current_uid: str = Depends(get_current_uid)):
    chat_ref = (
        db.collection("users")
        .document(current_uid)
        .collection("chats")
        .document(chat_id)
    )

    if not chat_ref.get().exists:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages = chat_ref.collection("messages").stream()
    for msg in messages:
        msg.reference.delete()

    chat_ref.delete()

    return {"success": True}


@app.get("/chats/{chat_id}/messages")
def get_messages(chat_id: str, current_uid: str = Depends(get_current_uid)):
    docs = (
        db.collection("users")
        .document(current_uid)
        .collection("chats")
        .document(chat_id)
        .collection("messages")
        .order_by("createdAt")
        .limit(100)
        .stream()
    )

    messages = []
    for doc in docs:
        messages.append(doc.to_dict())

    return messages


@app.post("/documents/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    chatId: str = Form(...),
    file: UploadFile = File(...),
    current_uid: str = Depends(get_current_uid),
):
    allowed_ext = [".pdf", ".docx", ".txt"]
    file_name = file.filename or "uploaded_file"
    ext = Path(file_name).suffix.lower()

    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, and TXT files are allowed.")

    file_bytes = await file.read()

    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size must be less than 20 MB.")

    document_id = str(uuid4())

    save_dir = UPLOAD_DIR / current_uid / document_id
    save_dir.mkdir(parents=True, exist_ok=True)

    local_path = save_dir / file_name

    with open(local_path, "wb") as f:
        f.write(file_bytes)

    doc_ref = (
        db.collection("users")
        .document(current_uid)
        .collection("documents")
        .document(document_id)
    )

    doc_ref.set({
        "documentId": document_id,
        "fileName": file_name,
        "localPath": str(local_path),
        "vectorCollectionName": "documents",
        "uploadedAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "embeddingStatus": "pending",
        "summary": "",
        "pageCount": 0,
        "fileSize": len(file_bytes),
    })

    chat_ref = (
        db.collection("users")
        .document(current_uid)
        .collection("chats")
        .document(chatId)
    )

    chat_ref.update({
        "activeDocumentId": document_id,
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    background_tasks.add_task(
        process_document_background,
        current_uid,
        document_id,
        chatId,
        file_name,
        str(local_path),
    )

    return {
        "documentId": document_id,
        "fileName": file_name,
        "embeddingStatus": "pending",
    }


@app.get("/documents")
def list_documents(current_uid: str = Depends(get_current_uid)):
    docs = (
        db.collection("users")
        .document(current_uid)
        .collection("documents")
        .order_by("uploadedAt", direction=firestore.Query.DESCENDING)
        .stream()
    )

    return [doc.to_dict() for doc in docs]


@app.get("/documents/{document_id}")
def get_document(document_id: str, current_uid: str = Depends(get_current_uid)):
    doc_ref = (
        db.collection("users")
        .document(current_uid)
        .collection("documents")
        .document(document_id)
    )

    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    return doc.to_dict()


@app.delete("/documents/{document_id}")
def delete_document(document_id: str, current_uid: str = Depends(get_current_uid)):
    doc_ref = (
        db.collection("users")
        .document(current_uid)
        .collection("documents")
        .document(document_id)
    )

    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Document not found")

    data = doc.to_dict() or {}
    local_path = data.get("localPath")

    if local_path:
        folder = Path(local_path).parent
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)

    delete_document_vectors(current_uid, document_id)
    doc_ref.delete()

    return {"success": True}




@app.post("/chat/message")
def chat_message(
    payload: ChatMessageRequest,
    current_uid: str = Depends(get_current_uid),
):
    clean_message = payload.message.replace("\x00", "").strip()

    if not clean_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    user_ref = db.collection("users").document(current_uid)
    chat_ref = user_ref.collection("chats").document(payload.chatId)

    chat_doc = chat_ref.get()
    if not chat_doc.exists:
        raise HTTPException(status_code=404, detail="Chat not found")

    chat_data = chat_doc.to_dict() or {}
    active_document_id = payload.activeDocumentId or chat_data.get("activeDocumentId")

    user_msg_ref = chat_ref.collection("messages").document()
    user_msg_ref.set({
        "messageId": user_msg_ref.id,
        "role": "user",
        "content": clean_message,
        "route": None,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "tokenUsage": None,
        "reasoningTrace": None,
        "documentId": active_document_id,
        "retrievedChunks": [],
        "feedback": None,
    })

    history = chat_history_tool(current_uid, payload.chatId)
    previous_route = get_previous_assistant_route(history)
    formatted_history = format_chat_history(history)

    route_meta = classify_route(
        query=clean_message,
        chat_history=history,
        active_document_id=active_document_id,
        previous_assistant_route=previous_route,
    )

    route = route_meta["route"]
    tools_used = ["chat_history_tool"]
    retrieved_previews = []

    if route == "google_search":
        try:
            search_results = google_search_tool(clean_message, num_results=5)
            search_context = format_search_results(search_results)

            prompt = GOOGLE_SEARCH_PROMPT.format(
                search_results=search_context,
                query=clean_message,
            )

            tools_used.extend(["google_search_tool", "gemini_tool"])
            answer, token_usage = generate_gemini_response(prompt)

            retrieved_previews = [
                {
                    "title": item.get("title"),
                    "preview": item.get("snippet"),
                    "url": item.get("url"),
                    "displayLink": item.get("displayLink"),
                }
                for item in search_results
            ]

        except Exception as e:
            answer = (
                "I tried to use Google Search, but the search tool failed. "
                f"Error: {str(e)}"
            )

            token_usage = {
                "inputTokens": 0,
                "outputTokens": 0,
                "totalTokens": 0,
                "model": "google_search_error",
            }

            tools_used.extend(["google_search_tool_failed"])

        trace = reasoning_trace_tool(
            query=clean_message,
            route_meta=route_meta,
            tools_used=tools_used,
            active_document_id=active_document_id,
            retrieved_chunks=retrieved_previews,
            token_usage=token_usage,
        )

        assistant_msg_ref = chat_ref.collection("messages").document()
        assistant_msg_ref.set({
            "messageId": assistant_msg_ref.id,
            "role": "assistant",
            "content": answer,
            "route": route,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "tokenUsage": token_usage,
            "reasoningTrace": trace,
            "documentId": active_document_id,
            "retrievedChunks": retrieved_previews,
            "feedback": None,
        })

        token_log_ref = user_ref.collection("tokenLogs").document()
        token_log_ref.set({
            "chatId": payload.chatId,
            "messageId": assistant_msg_ref.id,
            "model": token_usage.get("model"),
            "inputTokens": token_usage.get("inputTokens", 0),
            "outputTokens": token_usage.get("outputTokens", 0),
            "totalTokens": token_usage.get("totalTokens", 0),
            "route": route,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })

        chat_ref.update({
            "lastMessage": answer[:200],
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })

        return {
            "messageId": assistant_msg_ref.id,
            "answer": answer,
            "route": route,
            "reasoningTrace": trace,
            "tokenUsage": token_usage,
            "retrievedChunks": retrieved_previews,
        }

    if route in ["rag", "rag_followup"] and active_document_id:
        chunks = rag_tool(clean_message, current_uid, active_document_id, k=6)
        retrieved_previews = preview_chunks(chunks)
        retrieved_context = format_rag_chunks(chunks)

        prompt = RAG_PROMPT.format(
            retrieved_chunks=retrieved_context,
            chat_history=formatted_history,
            query=clean_message,
        )

        tools_used.extend(["rag_tool", "gemini_tool"])

    else:
        route = "gemini"
        route_meta["route"] = "gemini"

        prompt = TECHNICAL_PROMPT.format(
            chat_history=formatted_history,
            query=clean_message,
        )

        tools_used.append("gemini_tool")

    answer, token_usage = generate_gemini_response(prompt)

    trace = reasoning_trace_tool(
        query=clean_message,
        route_meta=route_meta,
        tools_used=tools_used,
        active_document_id=active_document_id,
        retrieved_chunks=retrieved_previews,
        token_usage=token_usage,
    )

    assistant_msg_ref = chat_ref.collection("messages").document()
    assistant_msg_ref.set({
        "messageId": assistant_msg_ref.id,
        "role": "assistant",
        "content": answer,
        "route": route,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "tokenUsage": token_usage,
        "reasoningTrace": trace,
        "documentId": active_document_id,
        "retrievedChunks": retrieved_previews,
        "feedback": None,
    })

    token_log_ref = user_ref.collection("tokenLogs").document()
    token_log_ref.set({
        "chatId": payload.chatId,
        "messageId": assistant_msg_ref.id,
        "model": token_usage.get("model"),
        "inputTokens": token_usage.get("inputTokens", 0),
        "outputTokens": token_usage.get("outputTokens", 0),
        "totalTokens": token_usage.get("totalTokens", 0),
        "route": route,
        "createdAt": firestore.SERVER_TIMESTAMP,
    })

    chat_ref.update({
        "lastMessage": answer[:200],
        "updatedAt": firestore.SERVER_TIMESTAMP,
    })

    return {
        "messageId": assistant_msg_ref.id,
        "answer": answer,
        "route": route,
        "reasoningTrace": trace,
        "tokenUsage": token_usage,
        "retrievedChunks": retrieved_previews,
    }


@app.post("/messages/{message_id}/feedback")
def message_feedback(
    message_id: str,
    payload: MessageFeedbackRequest,
    current_uid: str = Depends(get_current_uid),
):
    chats = (
        db.collection("users")
        .document(current_uid)
        .collection("chats")
        .stream()
    )

    for chat in chats:
        msg_ref = chat.reference.collection("messages").document(message_id)
        msg_doc = msg_ref.get()

        if msg_doc.exists:
            msg_ref.update({"feedback": payload.value})
            return {"success": True}

    raise HTTPException(status_code=404, detail="Message not found")
