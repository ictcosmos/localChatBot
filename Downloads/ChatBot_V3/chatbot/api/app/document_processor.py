import os
import time
import tempfile
from pathlib import Path
from google import genai
from google.genai import types
from google.cloud import firestore

from app.config import db, bucket, GEMINI_API_KEY
from app.parser import parse_document, chunk_document, count_tokens
from app.vector_store import get_collection

def get_gemini_client():
    """Initializes and returns the Google GenAI Client."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY environment variable is not configured.")
    return genai.Client(api_key=GEMINI_API_KEY)

def generate_embedding_with_retry(client, texts: list[str], task_type="RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """
    Generates embeddings for a batch of texts using text-embedding-004.
    Applies up to 2 retries with exponential backoff on failure.
    """
    max_retries = 2
    backoff = 1.0
    
    for attempt in range(max_retries + 1):
        try:
            response = client.models.embed_content(
                model="text-embedding-004",
                contents=texts,
                config=types.EmbedContentConfig(
                    task_type=task_type
                )
            )
            return [emb.values for emb in response.embeddings]
        except Exception as e:
            if attempt == max_retries:
                print(f"[Embedding SDK Error] Failed after {max_retries} retries: {e}")
                raise e
            print(f"[Embedding SDK Error] Attempt {attempt + 1} failed, retrying in {backoff}s: {e}")
            time.sleep(backoff)
            backoff *= 2
    return []

def generate_summary(client, text_subset: str) -> str:
    """Generates a 2-3 sentence summary of the text subset using gemini-2.5-flash."""
    prompt = (
        "You are a helpful document analyzer.\n"
        "Generate a concise 2-3 sentence summary of the following document content. "
        "Do not invent facts; rely only on the text.\n\n"
        f"--- CONTENT START ---\n{text_subset}\n--- CONTENT END ---\n\n"
        "Summary:"
    )
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        return response.text.strip() if response.text else "No summary available."
    except Exception as e:
        print(f"[Summary Generation Error] Failed to generate summary: {e}")
        return "Summary generation failed."

def process_document_background(uid: str, document_id: str, file_name: str, storage_path: str, chat_id: str):
    """
    FastAPI Background task that handles complete document ingestion, parsing,
    chunking, vectorization, local Chroma insertion, and Firestore updates.
    """
    print(f"[Processor] Starting job: uid={uid}, document_id={document_id}, file={file_name}")
    
    doc_ref = db.collection("users").document(uid).collection("documents").document(document_id)
    temp_local_path = None
    
    try:
        # 1. Download file from Firebase Storage
        print(f"[Processor] Downloading {storage_path} from Storage...")
        blob = bucket.blob(storage_path)
        
        # Ensure temporary file has correct suffix
        suffix = Path(file_name).suffix
        fd, temp_local_path = tempfile.mkstemp(suffix=suffix)
        os.close(fd)
        
        blob.download_to_filename(temp_local_path)
        file_size_bytes = os.path.getsize(temp_local_path)
        
        # 2. Parse text content
        print(f"[Processor] Parsing document structure...")
        pages_content = parse_document(temp_local_path)
        page_count = len(pages_content)
        
        # Validate minimum character count across pages
        total_chars = sum(len(txt) for _, txt in pages_content)
        if total_chars < 100:
            raise ValueError("Extracted text is too short (< 100 characters).")
        
        # 3. Chunk text content
        print(f"[Processor] Chunking extracted text...")
        chunks = chunk_document(pages_content)
        print(f"[Processor] Document split into {len(chunks)} chunks.")
        
        # 4. Generate Embeddings & Insert into Chroma DB
        client = get_gemini_client()
        chroma_collection = get_collection()
        
        batch_size = 100
        for idx in range(0, len(chunks), batch_size):
            batch = chunks[idx : idx + batch_size]
            batch_texts = [c["text"] for c in batch]
            
            print(f"[Processor] Embedding batch {idx // batch_size + 1}...")
            embeddings = generate_embedding_with_retry(client, batch_texts, task_type="RETRIEVAL_DOCUMENT")
            
            # Formulate IDs and Metadatas for Chroma
            ids = [f"{uid}:{document_id}:{c['chunkIndex']}" for c in batch]
            metadatas = [{
                "uid": uid,
                "documentId": document_id,
                "chatId": chat_id,
                "fileName": file_name,
                "pageNumber": c["pageNumber"],
                "chunkIndex": c["chunkIndex"],
                "charStart": c["charStart"],
                "charEnd": c["charEnd"]
            } for c in batch]
            
            # Ingest to local persistent Chroma
            chroma_collection.upsert(
                ids=ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=batch_texts
            )
            
        # 5. Generate 2-3 sentence summary using the first ~2000 tokens of text
        print(f"[Processor] Generating summary...")
        tokenizer = doc_ref # Not tokenizer, but tokenizer helper
        from app.parser import get_tokenizer
        tok = get_tokenizer()
        
        # Consolidate text until ~2000 tokens is met
        summary_text_pool = []
        token_acc = 0
        for _, page_text in pages_content:
            p_tokens = len(tok.encode(page_text))
            if token_acc + p_tokens <= 2000:
                summary_text_pool.append(page_text)
                token_acc += p_tokens
            else:
                # Add a slice of page to complete the limit
                slice_len = 2000 - token_acc
                sliced_tokens = tok.encode(page_text)[:slice_len]
                summary_text_pool.append(tok.decode(sliced_tokens))
                break
                
        summary_source = "\n\n".join(summary_text_pool)
        summary = generate_summary(client, summary_source)
        
        # 6. Update Firestore document state on success
        print(f"[Processor] Upload completed successfully.")
        
        # Make a public download URL (optional fallback or default format)
        file_url = blob.public_url
        
        doc_ref.update({
            "embeddingStatus": "completed",
            "summary": summary,
            "pageCount": page_count,
            "fileSize": file_size_bytes,
            "fileUrl": file_url,
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        
    except Exception as e:
        print(f"[Processor] Ingestion error: {e}")
        doc_ref.update({
            "embeddingStatus": "failed",
            "summary": f"Ingestion failed: {str(e)}",
            "updatedAt": firestore.SERVER_TIMESTAMP
        })
        
    finally:
        # Clean up local temporary file
        if temp_local_path and os.path.exists(temp_local_path):
            try:
                os.remove(temp_local_path)
            except Exception as ex:
                print(f"[Processor] Warning: could not delete temporary file: {ex}")
