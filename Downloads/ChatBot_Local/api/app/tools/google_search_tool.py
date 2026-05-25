from typing import List, Dict
import requests

from app.config import GOOGLE_CSE_ID, GOOGLE_CSE_KEY


def google_search_tool(query: str, num_results: int = 5) -> List[Dict]:
    if not GOOGLE_CSE_ID or not GOOGLE_CSE_KEY:
        raise ValueError("GOOGLE_CSE_ID or GOOGLE_CSE_KEY is missing in api/.env")

    url = "https://www.googleapis.com/customsearch/v1"

    params = {
        "key": GOOGLE_CSE_KEY,
        "cx": GOOGLE_CSE_ID,
        "q": query,
        "num": num_results,
    }

    response = requests.get(url, params=params, timeout=20)
    response.raise_for_status()

    data = response.json()
    items = data.get("items", [])

    results = []

    for item in items[:num_results]:
        results.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "url": item.get("link", ""),
            "displayLink": item.get("displayLink", ""),
        })

    return results


def format_search_results(results: List[Dict]) -> str:
    formatted = []

    for index, result in enumerate(results, start=1):
        formatted.append(
            f"[{index}] {result.get('title')}\n"
            f"Source: {result.get('displayLink')}\n"
            f"URL: {result.get('url')}\n"
            f"Snippet: {result.get('snippet')}"
        )

    return "\n\n".join(formatted)
