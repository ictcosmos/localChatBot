from typing import List, Dict, Optional

WEB_KEYWORDS = [
    "today",
    "yesterday",
    "latest",
    "current",
    "price",
    "news",
    "weather",
    "score",
    "recent",
    "this week",
    "now",
    "live",
    "won",
    "winner",
    "match",
    "ipl",
    "cricket",
    "football",
    "nba",
    "scorecard",
]

DOC_KEYWORDS = [
    "document",
    "file",
    "pdf",
    "uploaded",
    "this report",
    "this paper",
    "proposal",
    "summarize this",
    "from this",
]

ANAPHORIC_WORDS = [
    "it",
    "he",
    "she",
    "they",
    "that",
    "this",
    "more",
    "there",
    "what about",
    "explain more",
]


def classify_route(
    query: str,
    chat_history: List[Dict],
    active_document_id: Optional[str],
    previous_assistant_route: Optional[str],
) -> Dict:
    q = query.lower().strip()
    words = q.split()

    if any(keyword in q for keyword in WEB_KEYWORDS):
        return {
            "route": "google_search",
            "reason": "Query asks for current/recent/live information.",
            "confidence": 0.9,
            "precedence_rule_applied": "web_keyword",
        }

    if active_document_id and any(keyword in q for keyword in DOC_KEYWORDS):
        return {
            "route": "rag",
            "reason": "Active document exists and query refers to document.",
            "confidence": 0.9,
            "precedence_rule_applied": "document_keyword",
        }

    if (
        active_document_id
        and len(words) <= 8
        and previous_assistant_route in ["rag", "rag_followup"]
        and any(keyword in q for keyword in ANAPHORIC_WORDS)
    ):
        return {
            "route": "rag_followup",
            "reason": "Short follow-up after document-based answer.",
            "confidence": 0.85,
            "precedence_rule_applied": "rag_followup",
        }

    if active_document_id:
        return {
            "route": "rag",
            "reason": "Active document exists, defaulting to document answer.",
            "confidence": 0.75,
            "precedence_rule_applied": "active_document_default",
        }

    return {
        "route": "gemini",
        "reason": "Default technical/general Gemini answer.",
        "confidence": 0.8,
        "precedence_rule_applied": "default_gemini",
    }
