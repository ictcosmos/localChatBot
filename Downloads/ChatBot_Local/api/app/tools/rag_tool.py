from typing import List, Dict

from app.vector_store import rag_search_tool


def rag_tool(query: str, uid: str, document_id: str, k: int = 6) -> List[Dict]:
    return rag_search_tool(query=query, uid=uid, document_id=document_id, k=k)


def format_rag_chunks(chunks: List[Dict]) -> str:
    formatted = []

    for i, chunk in enumerate(chunks, start=1):
        page = chunk.get("pageNumber", "unknown")
        text = chunk.get("text", "")
        formatted.append(f"[Chunk {i} | p.{page}]\n{text}")

    return "\n\n".join(formatted)


def preview_chunks(chunks: List[Dict]) -> List[Dict]:
    previews = []

    for chunk in chunks:
        text = chunk.get("text", "")
        previews.append({
            "chunkId": chunk.get("chunkId"),
            "preview": text[:200],
            "similarity": chunk.get("similarity"),
            "pageNumber": chunk.get("pageNumber"),
            "chunkIndex": chunk.get("chunkIndex"),
        })

    return previews
