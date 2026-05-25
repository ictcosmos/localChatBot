from typing import List, Dict

from app.config import db


def chat_history_tool(uid: str, chat_id: str, limit: int = 6) -> List[Dict]:
    docs = (
        db.collection("users")
        .document(uid)
        .collection("chats")
        .document(chat_id)
        .collection("messages")
        .order_by("createdAt", direction="DESCENDING")
        .limit(limit)
        .stream()
    )

    messages = []

    for doc in reversed(list(docs)):
        data = doc.to_dict() or {}
        messages.append({
            "role": data.get("role", ""),
            "content": data.get("content", ""),
            "route": data.get("route"),
        })

    return messages


def get_previous_assistant_route(messages: List[Dict]):
    for message in reversed(messages):
        if message.get("role") == "assistant":
            return message.get("route")
    return None


def format_chat_history(messages: List[Dict]) -> str:
    lines = []
    for message in messages:
        lines.append(f"{message.get('role')}: {message.get('content')}")
    return "\n".join(lines)
