# Domain seed data for Pinecone di-domain-knowledge-dev

Place JSON files here to seed the domain knowledge index. Each file should be a JSON array of objects with:

- `persona` (string): e.g. `"Hydroelectric"`
- `dimension` (string): exact dimension name as in `persona_dimensions` (e.g. `"Reliability / Security"`)
- `source` (string): short label for citations (e.g. `"Hydroelectric scoring guide"`)
- `chunk_text` (string): guidance text (roughly 300–800 tokens per chunk)

From repo root, run:

```bash
PYTHONPATH=. python scripts/seed_domain_index.py
```

Requires `OPENAI_API_KEY` or `OPEN_API_KEY`, `PINECONE_API_KEY`, and `PINECONE_DOMAIN_INDEX_HOST` (or index name).
