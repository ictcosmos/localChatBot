import os
import re
from pathlib import Path
import tiktoken
from pypdf import PdfReader
import docx

def get_tokenizer():
    """Returns the cl100k_base tokenizer approximation for token counting."""
    return tiktoken.get_encoding("cl100k_base")

def count_tokens(text: str) -> int:
    """Returns token count in text using the cl100k_base tokenizer."""
    tokenizer = get_tokenizer()
    return len(tokenizer.encode(text))

def parse_document(file_path: str) -> list[tuple[int, str]]:
    """
    Parses a document based on its extension.
    Returns a list of tuples containing (page_number, text_content).
    Enforces page limit and validates scanned text status.
    """
    suffix = Path(file_path).suffix.lower()
    
    if suffix == ".pdf":
        reader = PdfReader(file_path)
        page_count = len(reader.pages)
        if page_count > 200:
            raise ValueError("Document exceeds maximum page count of 200 pages.")
        
        pages_content = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            # scanned PDF guard: check if text character count on page is < 20
            if len(page_text.strip()) < 20:
                raise ValueError("scanned PDF not supported")
            pages_content.append((i + 1, page_text))
        return pages_content
        
    elif suffix == ".docx":
        doc = docx.Document(file_path)
        full_text = []
        for para in doc.paragraphs:
            full_text.append(para.text)
        text = "\n".join(full_text)
        
        # docx has no native pages, treat entire doc as page 1
        return [(1, text)]
        
    elif suffix == ".txt":
        with open(file_path, "rb") as f:
            content_bytes = f.read()
        try:
            text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = content_bytes.decode("latin-1")
            
        return [(1, text)]
        
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

def chunk_document(pages_content: list[tuple[int, str]], chunk_size=800, overlap=120) -> list[dict]:
    """
    Chunks document text into slices of approximately `chunk_size` tokens,
    with `overlap` tokens overlap, preserving paragraph boundaries where possible.
    
    Returns a list of dictionaries with metadata:
      - text: str
      - pageNumber: int
      - charStart: int
      - charEnd: int
      - chunkIndex: int
    """
    tokenizer = get_tokenizer()
    chunks = []
    chunk_index = 0

    for page_num, text in pages_content:
        paragraphs = re.split(r'\n\n+', text)
        current_chunk_paragraphs = []
        current_tokens_count = 0
        char_offset = 0

        for para in paragraphs:
            para_tokens = tokenizer.encode(para)
            para_len = len(para_tokens)
            
            # If paragraph itself is larger than chunk_size, split it strictly by tokens
            if para_len > chunk_size:
                # Output whatever is in current accumulator first
                if current_chunk_paragraphs:
                    chunk_text = "\n\n".join(current_chunk_paragraphs)
                    chunks.append({
                        "text": chunk_text,
                        "pageNumber": page_num,
                        "charStart": max(0, char_offset - len(chunk_text)),
                        "charEnd": char_offset,
                        "chunkIndex": chunk_index
                    })
                    chunk_index += 1
                    current_chunk_paragraphs = []
                    current_tokens_count = 0
                
                # Split large paragraph by tokens
                for i in range(0, para_len, chunk_size - overlap):
                    slice_tokens = para_tokens[i : i + chunk_size]
                    slice_text = tokenizer.decode(slice_tokens)
                    chunks.append({
                        "text": slice_text,
                        "pageNumber": page_num,
                        "charStart": char_offset + text.find(slice_text[:20]),
                        "charEnd": char_offset + text.find(slice_text[:20]) + len(slice_text),
                        "chunkIndex": chunk_index
                    })
                    chunk_index += 1
                
                char_offset += len(para) + 2
                continue

            # Standard paragraph accumulation
            if current_tokens_count + para_len > chunk_size:
                # Save current accumulator
                chunk_text = "\n\n".join(current_chunk_paragraphs)
                chunks.append({
                    "text": chunk_text,
                    "pageNumber": page_num,
                    "charStart": max(0, char_offset - len(chunk_text)),
                    "charEnd": char_offset,
                    "chunkIndex": chunk_index
                })
                chunk_index += 1
                
                # Setup overlap: keep paragraph history to satisfy ~overlap tokens
                overlap_paragraphs = []
                overlap_tokens = 0
                for prev_para in reversed(current_chunk_paragraphs):
                    prev_tokens = len(tokenizer.encode(prev_para))
                    if overlap_tokens + prev_tokens <= overlap:
                        overlap_paragraphs.insert(0, prev_para)
                        overlap_tokens += prev_tokens
                    else:
                        break
                
                current_chunk_paragraphs = overlap_paragraphs + [para]
                current_tokens_count = overlap_tokens + para_len
            else:
                current_chunk_paragraphs.append(para)
                current_tokens_count += para_len
            
            char_offset += len(para) + 2

        # Add remaining paragraphs
        if current_chunk_paragraphs:
            chunk_text = "\n\n".join(current_chunk_paragraphs)
            chunks.append({
                "text": chunk_text,
                "pageNumber": page_num,
                "charStart": max(0, char_offset - len(chunk_text)),
                "charEnd": char_offset,
                "chunkIndex": chunk_index
            })
            chunk_index += 1

    return chunks
