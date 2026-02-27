# Spark Journal API — How to Query

The journal is a static JSON file at `https://journal.nvision.me/data/entries.json`.
No Supabase, no RAG, no database needed — just fetch and parse.

## Quick Query (Bash)

```bash
# Get all entries
curl -s https://journal.nvision.me/data/entries.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for e in data['entries']:
    print(f'{e[\"date\"][:10]} [{e[\"category\"]}] {e[\"title_en\"]}')"

# Filter by category
curl -s https://journal.nvision.me/data/entries.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
for e in data['entries']:
    if e['category'] == 'research':
        print(f'{e[\"date\"][:10]} {e[\"title_en\"]}')"

# Search by keyword
curl -s https://journal.nvision.me/data/entries.json | python3 -c "
import json, sys
data = json.load(sys.stdin)
q = 'whatsapp'
for e in data['entries']:
    if q in json.dumps(e).lower():
        print(f'{e[\"date\"][:10]} [{e[\"category\"]}] {e[\"title_en\"]}')"
```

## Categories

- `system` — System updates, config changes
- `monitoring` — Health checks, backups, status reports
- `security` — Security audits, incidents
- `deployment` — Deployment activities
- `performance` — Performance optimization
- `features` — New features implemented
- `research` — Research/analysis, "question about..." topics
- `future-plans` — Discussed but not yet implemented
- `projects` — TRAE, vibe-code-news specific work

## Entry Schema

```json
{
  "id": "2026-02-27-system-status",
  "date": "2026-02-27T00:00:00Z",
  "category": "monitoring",
  "severity": "success|warning|info|critical",
  "tags": ["tag1", "tag2"],
  "title_en": "English title",
  "title_he": "כותרת בעברית",
  "summary_en": "...",
  "summary_he": "...",
  "details_en": "<html>...",
  "details_he": "<html>...",
  "related": ["other-entry-id"],
  "source_email": "filename.json"
}
```

## Why No Supabase / RAG?

- **34 entries** (1.1MB JSON) — trivially small, loads in <500ms
- GLM-5 can parse JSON natively — no vector embeddings needed
- Structured data with categories/tags — search by field, not semantic similarity
- Adding entries = edit JSON + push to GitHub → auto-deploys
- When it grows to 200+ entries, consider a CF Worker API for filtered queries
