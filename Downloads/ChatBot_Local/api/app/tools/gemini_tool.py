from google import genai

from app.config import GEMINI_API_KEY

CHAT_MODEL = "gemini-2.5-flash"


def get_client():
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is missing in api/.env")
    return genai.Client(api_key=GEMINI_API_KEY)


def generate_gemini_response(prompt: str):
    client = get_client()

    response = client.models.generate_content(
        model=CHAT_MODEL,
        contents=prompt,
    )

    text = response.text or ""

    usage = getattr(response, "usage_metadata", None)

    token_usage = {
        "inputTokens": getattr(usage, "prompt_token_count", 0) if usage else 0,
        "outputTokens": getattr(usage, "candidates_token_count", 0) if usage else 0,
        "totalTokens": getattr(usage, "total_token_count", 0) if usage else 0,
        "model": CHAT_MODEL,
    }

    return text, token_usage
