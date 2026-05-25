from typing import Dict, List, Optional


def reasoning_trace_tool(
    query: str,
    route_meta: Dict,
    tools_used: List[str],
    active_document_id: Optional[str],
    retrieved_chunks: Optional[List[Dict]],
    token_usage: Dict,
) -> Dict:
    return {
        "userQuery": query,
        "selectedRoute": route_meta.get("route"),
        "reason": route_meta.get("reason"),
        "confidence": route_meta.get("confidence"),
        "precedenceRuleApplied": route_meta.get("precedence_rule_applied"),
        "toolsUsed": tools_used,
        "activeDocumentId": active_document_id,
        "retrievedChunksCount": len(retrieved_chunks or []),
        "retrievedChunksPreview": retrieved_chunks or [],
        "tokenUsage": token_usage,
    }

