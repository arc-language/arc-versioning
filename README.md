# arc-versioning

[![npm](https://img.shields.io/npm/v/arc-versioning.svg)](https://www.npmjs.com/package/arc-versioning)
[![CI](https://github.com/arc-language/arc-versioning/actions/workflows/ci.yml/badge.svg)](https://github.com/arc-language/arc-versioning/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**Automatic model versioning and history for [Arc](https://arc-lang.com).** Every mutation is snapshotted with zero annotation — no decorators, no model changes. Editors can browse the full change history and revert to any previous state with one click.

Inspired by [django-reversion](https://github.com/etianen/django-reversion) and [django-simple-history](https://github.com/treyhunner/django-simple-history).

---

## Why

Arc has no built-in change history. If an editor overwrites a page or deletes a record, it's gone. `arc-versioning` fixes this by wrapping every database mutation at the framework level — you don't annotate models, you don't change any code. Install the package, add one line to `arc.config.json`, and every future mutation is automatically snapshotted.

---

## Installation

```bash
npm install arc-versioning
```

Add to `arc.config.json`:

```json
{ "packages": ["arc-versioning"] }
```

Done. Run `arc serve` or `arc build` — every model is now versioned.

---

## Configuration

All options are optional:

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
| `maxVersionsPerRecord` | `100` | Max snapshots per record. Older ones trimmed asynchronously. |
| `excludeModels` | `[]` | Table names to exclude from versioning. |

---

## How it works

At build time, `arc-versioning` injects a thin wrapper around every `db.*` model helper:

- **`create`** — snapshots the newly created record (after-state)
- **`update`** — snapshots the record after update (after-state)
- **`delete`** — snapshots the record **before** deletion (before-state, so it can be restored)

Snapshots go into a single `_arc_versions` table with three covering indexes for O(log N) access. The wrapper is a ~50-line IIFE emitted into `dist/server.js` — zero runtime dependencies.

Failures are caught and logged as `console.warn` — a broken versioning table will never crash your application.

---

## History viewer (arc-cms)

When used with [arc-cms](https://github.com/arc-language/arc-cms), a full history UI is available at:

```
/admin/history/:model/:id
```

Features:
- Timeline of all changes, newest first, paginated (20/page)
- Color-coded action badges — `create` (green), `update` (blue), `delete` (red), `revert` (purple)
- User attribution (who made the change)
- Expandable field diffs — shows exactly which fields changed and their before/after values
- One-click revert with confirmation modal
- Reverting adds a `revert` entry to the history — the audit trail is never destroyed

---

## REST API

Three routes are automatically registered at `/admin/api`:

```
GET  /admin/api/versions/:model/:id
     → { versions[], hasMore, page, total }
     Paginated history. ?page=N for subsequent pages.
     User display names are joined automatically.

GET  /admin/api/versions/:model/:id/:versionId
     → { version, diff[] }
     Single version with a computed field diff vs. the previous snapshot.

POST /admin/api/versions/:model/:id/revert/:versionId
     → { ok: true, revertedToVersionId }
     Revert to a snapshot. Creates a new `revert` history entry.
```

All routes require `admin` or `editor` role.

---

## What gets versioned

| Source | Versioned? |
|---|---|
| All user-defined Arc models | ✅ Yes |
| arc-cms models (users, pages, groups, media, pageblocks) | ✅ Yes |
| `_arc_versions` itself | ❌ No (recursion prevention) |
| Tables in `excludeModels` | ❌ No (opt-out) |

---

## Performance

| Operation | Time | Notes |
|---|---|---|
| Record mutation | O(log N) INSERT + O(1) main op | Prepared statement, < 0.1ms |
| History fetch | O(log N) | Covered by `(modelName, recordId, id DESC)` index |
| Revert | O(log N) lookup + O(1) UPDATE | |
| Trim (cleanup) | O(K) DELETE, async | Never blocks mutations |

Storage is bounded to `maxVersionsPerRecord × number_of_models × avg_row_bytes`.

---

## TypeScript

```ts
import type { ArcVersion, VersioningConfig, ArcConfigWithVersioning } from 'arc-versioning'

const version: ArcVersion = {
  id: 1,
  modelName: 'posts',
  recordId: '42',
  action: 'update',    // 'create' | 'update' | 'delete' | 'revert'
  data: '{"title":"Hello"}',
  userId: 'u_1',
  createdAt: '2026-06-01T12:00:00Z',
  userName: 'Alice',   // enriched by history API
}
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © arc-language
