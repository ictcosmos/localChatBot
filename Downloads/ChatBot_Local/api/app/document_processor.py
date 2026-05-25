import time
from typing import List

from google import genai
from google.cloud import firestore

from app.config import db, GEMINI_API_KEY
from app.parser import parse_document, chunk_document
from app.vector_store import get_collection

EMBEDDING_MODEL = "gemini-embedding-001"
SUMMARY_MODEL = "gemini-2.5-flash"


def get_gemini_client():
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is missing in api/.env")
    return genai.Client(api_key=GEMINI_API_KEY)


def embed_batch_with_retry(texts: List[str], retries: int = 2) -> List[List[float]]:
    client = get_gemini_client()

    for attempt in range(retries + 1):
        try:
            response = client.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=texts,
                config={"task_type": "RETRIEVAL_DOCUMENT"},
            )
            return [embedding.values for embedding in response.embeddings]

        except Exception:
            if attempt >= retries:
                raise
            time.sleep(2 ** attempt)

    return []


def generate_summary(text: str) -> str:
    client = get_gemini_client()

    prompt = f"""
Summarize this document in 2-3 sentences.

Document:
{text[:8000]}
"""

    response = client.models.generate_content(
        model=SUMMARY_MODEL,
        contents=prompt,
    )

    return response.text or ""


def process_document_background(
    uid: str,
    document_id: str,
    chat_id: str,
    file_name: str,
    local_path: str,
):
    doc_ref = (
        db.collection("users")
        .document(uid)
        .collection("documents")
        .document(document_id)
    )

    try:
        doc_ref.update({
            "embeddingStatus": "processing",
            "summary": "",
        })

        pages, page_count = parse_document(local_path)

        full_text = "\n\n".join([page["text"] for page in pages])
        if len(full_text.strip()) < 100:
            raise ValueError("Extracted text is too short.")

        chunks = chunk_document(pages)
        collection = get_collection()

        batch_size = 100

        for start in range(0, len(chunks), batch_size):
            batch = chunks[start:start + batch_size]
            texts = [chunk["text"] for chunk in batch]
            embeddings = embed_batch_with_retry(texts)

            ids = []
            metadatas = []

            for chunk in batch:
                chunk_index = chunk["chunkIndex"]
                vector_id = f"{uid}:{document_id}:{chunk_index}"

                ids.append(vector_id)
                metadatas.append({
                    "uid": uid,
                    "documentId": document_id,
                    "chatId": chat_id,
                    "fileName": file_name,
                    "pageNumber": chunk["pageNumber"],
                    "chunkIndex": chunk_index,
                    "charStart": chunk["charStart"],
                    "charEnd": chunk["charEnd"],
                })

            collection.upsert(
                ids=ids,
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas,
            )

        summary = generate_summary(full_text)

        doc_ref.update({
            "embeddingStatus": "completed",
            "summary": summary,
            "pageCount": page_count,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })

    except Exception as e:
        doc_ref.update({
            "embeddingStatus": "failed",
            "summary": str(e),
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
