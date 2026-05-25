from typing import List, Dict

import chromadb
from google import genai

from app.config import CHROMA_DIR, GEMINI_API_KEY

COLLECTION_NAME = "documents"
EMBEDDING_MODEL = "gemini-embedding-001"

client = chromadb.PersistentClient(path=str(CHROMA_DIR))


def get_collection():
    return client.get_or_create_collection(name=COLLECTION_NAME)


def get_gemini_client():
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is missing in api/.env")
    return genai.Client(api_key=GEMINI_API_KEY)


def embed_text(text: str, task_type: str) -> List[float]:
    gemini_client = get_gemini_client()

    response = gemini_client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config={"task_type": task_type},
    )

    return response.embeddings[0].values


def rag_search_tool(
    query: str,
    uid: str,
    document_id: str,
    k: int = 6,
) -> List[Dict]:
    collection = get_collection()

    query_embedding = embed_text(query, task_type="RETRIEVAL_QUERY")

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=k,
        where={
            "$and": [
                {"uid": {"$eq": uid}},
                {"documentId": {"$eq": document_id}},
            ]
        },
        include=["documents", "metadatas", "distances"],
    )

    docs = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]
    ids = results.get("ids", [[]])[0]

    chunks = []

    for chunk_id, text, metadata, distance in zip(ids, docs, metadatas, distances):
        similarity = 1 / (1 + float(distance))

        chunks.append({
            "chunkId": chunk_id,
            "text": text,
            "similarity": similarity,
            "pageNumber": metadata.get("pageNumber"),
            "chunkIndex": metadata.get("chunkIndex"),
        })

    chunks.sort(key=lambda x: x["similarity"], reverse=True)
    return chunks


def delete_document_vectors(uid: str, document_id: str):
    collection = get_collection()

    existing = collection.get(
        where={
            "$and": [
                {"uid": {"$eq": uid}},
                {"documentId": {"$eq": document_id}},
            ]
        }
    )

    ids = existing.get("ids", [])
    if ids:
        collection.delete(ids=ids)
