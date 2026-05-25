from pathlib import Path
from typing import List, Dict, Tuple

import tiktoken
from pypdf import PdfReader
from docx import Document


def get_tokenizer():
    # Gemini tokenizer is different, but cl100k_base is good enough for chunk sizing.
    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(get_tokenizer().encode(text))


def parse_document(file_path: str) -> Tuple[List[Dict], int]:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return parse_pdf(path)

    if suffix == ".docx":
        return parse_docx(path)

    if suffix == ".txt":
        return parse_txt(path)

    raise ValueError("Unsupported file type. Only PDF, DOCX, and TXT are allowed.")


def parse_pdf(path: Path) -> Tuple[List[Dict], int]:
    reader = PdfReader(str(path))
    page_count = len(reader.pages)

    if page_count > 200:
        raise ValueError("Document has more than 200 pages.")

    pages = []

    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""

        if len(text.strip()) < 20:
            raise ValueError("scanned PDF not supported")

        pages.append({
            "pageNumber": i,
            "text": text.strip(),
        })

    return pages, page_count


def parse_docx(path: Path) -> Tuple[List[Dict], int]:
    doc = Document(str(path))
    text = "\n".join([p.text for p in doc.paragraphs if p.text.strip()])

    if len(text.strip()) < 100:
        raise ValueError("Extracted text is too short.")

    return [{"pageNumber": 1, "text": text.strip()}], 1


def parse_txt(path: Path) -> Tuple[List[Dict], int]:
    raw = path.read_bytes()

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")

    if len(text.strip()) < 100:
        raise ValueError("Extracted text is too short.")

    return [{"pageNumber": 1, "text": text.strip()}], 1


def chunk_document(
    pages: List[Dict],
    chunk_size: int = 800,
    overlap: int = 120,
) -> List[Dict]:
    tokenizer = get_tokenizer()
    chunks = []
    chunk_index = 0

    for page in pages:
        page_number = page["pageNumber"]
        text = page["text"]

        tokens = tokenizer.encode(text)

        start = 0
        while start < len(tokens):
            end = min(start + chunk_size, len(tokens))
            chunk_tokens = tokens[start:end]
            chunk_text = tokenizer.decode(chunk_tokens).strip()

            if chunk_text:
                chunks.append({
                    "text": chunk_text,
                    "pageNumber": page_number,
                    "chunkIndex": chunk_index,
                    "charStart": start,
                    "charEnd": end,
                })
                chunk_index += 1

            if end == len(tokens):
                break

            start = max(0, end - overlap)

    return chunks
