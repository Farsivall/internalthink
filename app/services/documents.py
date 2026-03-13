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


MIN_TEXT_CHARS_PER_PAGE = 50


def _render_pdf_page_as_png(file_bytes: bytes, page_index: int) -> bytes | None:
    """Render a single PDF page as a PNG using PyMuPDF. Returns PNG bytes or None."""
    try:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        if page_index >= len(doc):
            return None
        page = doc[page_index]
        pix = page.get_pixmap(dpi=200)
        png_bytes = pix.tobytes("png")
        doc.close()
        return png_bytes
    except ImportError:
        logger.debug("PyMuPDF not installed; cannot render PDF page as image.")
        return None
    except Exception as e:
        logger.warning("Failed to render PDF page %d as image: %s", page_index, e)
        return None


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from a PDF file.

    For pages with little or no text (scanned pages, charts, diagrams),
    renders the page as an image and uses Vision OCR to extract content.
    """
    reader = PdfReader(BytesIO(file_bytes))
    pages: list[str] = []

    vision_pages_to_process: list[int] = []

    for i, page in enumerate(reader.pages):
        text = (page.extract_text() or "").strip()
        if len(text) >= MIN_TEXT_CHARS_PER_PAGE:
            pages.append(text)
        else:
            vision_pages_to_process.append(i)
            if text:
                pages.append(text)
            else:
                pages.append("")

    if vision_pages_to_process:
        for page_idx in vision_pages_to_process:
            png_bytes = _render_pdf_page_as_png(file_bytes, page_idx)
            if not png_bytes:
                continue
            if len(png_bytes) > IMAGE_EXTRACTION_MAX_BYTES:
                logger.info("Skipping PDF page %d: rendered image too large for Vision.", page_idx)
                continue
            try:
                ocr_text = _extract_pdf_page_content(png_bytes)
                if ocr_text and ocr_text.strip():
                    existing = pages[page_idx] if page_idx < len(pages) else ""
                    if existing:
                        pages[page_idx] = existing + "\n\n" + ocr_text.strip()
                    else:
                        pages[page_idx] = ocr_text.strip()
            except Exception as e:
                logger.warning("Vision OCR failed for PDF page %d: %s", page_idx, e)

    full_text = "\n".join(p for p in pages if p).strip()

    if not full_text:
        raise ValueError(
            "Could not extract any text from this PDF, even with image analysis. "
            "The file may be corrupted or contain no readable content."
        )

    return full_text


def _extract_pdf_page_content(png_bytes: bytes) -> str:
    """Send a rendered PDF page image to Vision with a prompt that captures both text and visual content."""
    client = _get_openai_client()
    if not client:
        raise ValueError("OpenAI API key not configured; cannot analyse PDF page image.")
    b64 = base64.standard_b64encode(png_bytes).decode("ascii")
    data_uri = f"data:image/png;base64,{b64}"
    try:
        r = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_uri}},
                        {
                            "type": "text",
                            "text": (
                                "This is a page from a PDF document. Extract and describe ALL content:\n"
                                "1. Extract all visible text, preserving structure (headings, lists, tables).\n"
                                "2. For charts, graphs, or diagrams: describe what they show, including axis labels, "
                                "data points, trends, and key takeaways.\n"
                                "3. For tables: reproduce the data in a readable text format.\n"
                                "4. For maps or technical drawings: describe the key elements and any labels.\n"
                                "Output plain text only. Be thorough — this content will be used for decision analysis."
                            ),
                        },
                    ],
                }
            ],
            max_tokens=4096,
        )
    except Exception as e:
        logger.warning("Vision failed for PDF page analysis: %s", e)
        raise
    text = r.choices or []
    if not text:
        return ""
    return (getattr(text[0].message, "content", None) or "").strip()


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
