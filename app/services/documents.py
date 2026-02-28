from io import BytesIO
from pypdf import PdfReader


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


def truncate_to_word_limit(text: str, max_words: int = 3000) -> str:
    """Truncate text to a maximum word count.

    If the text exceeds the limit, keeps the first max_words words
    and appends a truncation note.
    """
    words = text.split()
    if len(words) <= max_words:
        return text

    truncated = " ".join(words[:max_words])
    return truncated + "\n\n[Document truncated — first 3,000 words shown]"
