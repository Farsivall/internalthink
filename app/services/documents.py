import base64
import logging
from io import BytesIO
from pypdf import PdfReader

logger = logging.getLogger(__name__)

# MIME types supported for image text extraction (OpenAI Vision).
IMAGE_EXTRACTION_MIMES = frozenset({"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"})
# Max size for vision API (OpenAI allows up to 20MB; keep a safe limit).
IMAGE_EXTRACTION_MAX_BYTES = 19 * 1024 * 1024


def strip_null_bytes(s: str) -> str:
    """Remove null bytes so text can be stored in PostgreSQL (text type disallows \\u0000)."""
    if not isinstance(s, str):
        return s
    return s.replace("\x00", "")


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file.

    Raises ValueError if the PDF contains no extractable text
    (e.g. scanned image PDFs).
    """
    reader = PdfReader(BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)

    full_text = "\n".join(pages).strip()

    if not full_text:
        raise ValueError(
            "Could not extract text from this PDF. "
            "It may be a scanned image. Please paste the content manually instead."
        )

    return full_text


def _get_openai_client():
    """Return OpenAI client for vision API, or None if not configured."""
    try:
        from openai import OpenAI
    except ImportError:
        return None
    import os
    key = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPEN_API_KEY")
    if not key:
        try:
            from app.core.config import settings
            key = getattr(settings, "openai_api_key", None) or getattr(settings, "open_api_key", None)
        except Exception:
            pass
    if not key or (isinstance(key, str) and "your_" in key.lower()):
        return None
    return OpenAI(api_key=key)


def extract_text_from_image(file_bytes: bytes, mime_type: str) -> str:
    """Extract text from an image using OpenAI Vision.

    Supported MIME types: image/png, image/jpeg, image/webp, image/gif.
    Images over IMAGE_EXTRACTION_MAX_BYTES are rejected.

    Returns:
        Extracted plain text. May be empty if the image has no text or vision returns nothing.

    Raises:
        ValueError: Unsupported MIME, file too large, or OpenAI not configured.
        Other exceptions from the API (e.g. rate limit) may propagate so the caller can set content to None.
    """
    mime = (mime_type or "").strip().lower()
    if mime not in IMAGE_EXTRACTION_MIMES:
        raise ValueError(f"Unsupported image type for text extraction: {mime_type or 'unknown'}")
    if len(file_bytes) > IMAGE_EXTRACTION_MAX_BYTES:
        raise ValueError(
            f"Image too large for text extraction (max {IMAGE_EXTRACTION_MAX_BYTES // (1024*1024)}MB)."
        )
    client = _get_openai_client()
    if not client:
        raise ValueError("OpenAI API key not configured; cannot extract text from image.")

    b64 = base64.standard_b64encode(file_bytes).decode("ascii")
    data_uri = f"data:{mime};base64,{b64}"

    try:
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": data_uri},
                        },
                        {
                            "type": "text",
                            "text": "Extract all text from this image. Preserve structure (e.g. headings, lists) where visible. Output plain text only. If there is no text, reply with a single space.",
                        },
                    ],
                }
            ],
            max_tokens=4096,
        )
    except Exception as e:
        logger.warning("OpenAI Vision failed for image text extraction: %s", e)
        raise

    text = (r.choices or [])
    if not text:
        return ""
    content = getattr(text[0].message, "content", None) or ""
    return (content or "").strip() or " "


def truncate_to_word_limit(text: str, max_words: int = 3000) -> str:
    """Truncate text to a maximum word count.

    If the text exceeds the limit, keeps the first max_words words
    and appends a truncation note. Also strips null bytes for DB compatibility.
    """
    text = strip_null_bytes(text)
    words = text.split()
    if len(words) <= max_words:
        return text

    truncated = " ".join(words[:max_words])
    return truncated + "\n\n[Document truncated — first 3,000 words shown]"
