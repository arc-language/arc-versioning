# arc-versioning

Automatic model versioning and history for Arc — every mutation snapshotted, one-click revert.

Inspired by [django-reversion](https://github.com/etianen/django-reversion) and [django-simple-history](https://github.com/treyhunner/django-simple-history).

## Installation

```bash
npm install arc-versioning
```

Add to `arc.config.json`:

```json
{ "packages": ["arc-versioning"] }
```

That's it. Every model is automatically versioned on the next `arc serve` or `arc build`.

## Configuration (optional)

```json
{
  "packages": ["arc-versioning"],
  "versioning": {
    "maxVersionsPerRecord": 100,
    "excludeModels": []
  }
}
```

| Option | Default | Description |
|---|---|---|
| `maxVersionsPerRecord` | `100` | Max versions stored per record. Older ones trimmed asynchronously. |
| `excludeModels` | `[]` | Table names to exclude from versioning. |

## What gets versioned

- All user-defined models automatically
- arc-cms models (users, pages, groups, media, pageblocks)
- `_arc_versions` itself is always excluded (recursion prevention)

## Version history API

When installed, two API routes are added at `/admin/api`:

```
GET  /admin/api/versions/:model/:id              — paginated history (20/page, ?page=N)
GET  /admin/api/versions/:model/:id/:versionId   — single version with field diff
POST /admin/api/versions/:model/:id/revert/:versionId  — revert to snapshot
```

Both routes require `admin` or `editor` role.

## History UI

A history viewer is available at `/admin/history/:model/:id` within arc-cms. It shows:

- Timeline of changes, newest first
- Color-coded action badges (create / update / delete / revert)
- User attribution and timestamps
- Expandable field diffs (what changed)
- One-click revert with confirmation modal

## Performance

- O(log N) insert via indexed table
- Async trim — never blocks mutations
- Version write failures log a warning, never crash your app
- Storage bounded to `maxVersionsPerRecord × models × avg_row_size`

## TypeScript

```ts
import type { ArcVersion, VersioningConfig } from 'arc-versioning'
```

## License

MIT
