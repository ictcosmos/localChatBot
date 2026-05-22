import os
from pathlib import Path
import chromadb
from google import genai
from google.genai import types

# Load API Key
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Determine persistent storage path for local Chroma (relative to backend folder)
CHROMA_DATA_DIR = os.environ.get("CHROMA_DATA_DIR", "./chroma_data")

# Initialize persistent Chroma client in-process
try:
    client = chromadb.PersistentClient(path=CHROMA_DATA_DIR)
except Exception as e:
    print(f"CRITICAL: Failed to initialize Chroma DB at {CHROMA_DATA_DIR}: {e}")
    client = None

def get_collection():
    """
    Returns the single default collection 'documents' for storing parsed document embeddings.
    Creates it if it does not exist.
    """
    if client is None:
        raise RuntimeError("Chroma DB client is not initialized.")
    return client.get_or_create_collection(name="documents")

def rag_search_tool(query: str, uid: str, document_id: str, k: int = 6) -> list[dict]:
    """
    Retrieves the top k most similar document chunks matching the user's query,
    enforcing strict security filtering on uid and documentId.
    
    Returns:
      List of dicts: [{"chunkId": str, "text": str, "similarity": float, "pageNumber": int, "chunkIndex": int}]
    """
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not configured on the backend.")
        
    ai_client = genai.Client(api_key=GEMINI_API_KEY)
    
    # 1. Embed query
    response = ai_client.models.embed_content(
        model="text-embedding-004",
        contents=query,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY"
        )
    )
    query_embedding = response.embeddings[0].values
    
    # 2. Query Chroma with metadata filters
    collection = get_collection()
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=k,
        where={
            "$and": [
                {"uid": {"$eq": uid}},
                {"documentId": {"$eq": document_id}}
            ]
        }
    )
    
    # 3. Parse and sort by similarity descending
    chunks = []
    if not results or not results["ids"] or len(results["ids"][0]) == 0:
        return []
        
    ids = results["ids"][0]
    documents = results["documents"][0]
    metadatas = results["metadatas"][0]
    distances = results["distances"][0] if results["distances"] else [0.0] * len(ids)
    
    for i in range(len(ids)):
        # Convert distance to similarity score: standard L2 distance to cosine-like similarity
        # Chroma default is squared L2 distance. Similarity = 1 / (1 + distance)
        dist = distances[i]
        similarity = float(1.0 / (1.0 + dist))
        
        meta = metadatas[i]
        chunks.append({
            "chunkId": ids[i],
            "text": documents[i],
            "similarity": similarity,
            "pageNumber": int(meta.get("pageNumber", 1)),
            "chunkIndex": int(meta.get("chunkIndex", 0))
        })
        
    # Sort by similarity descending
    chunks.sort(key=lambda x: x["similarity"], reverse=True)
    return chunks
