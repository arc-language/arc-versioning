# Changelog

## 0.1.0 — 2026-06-01

Initial release.

- Automatic versioning for all Arc models (`create`, `update`, `delete`)
- `_arc_versions` table with 3 covering indexes for O(log N) access
- Configurable `maxVersionsPerRecord` cap with async trim
- `excludeModels` to opt out specific tables
- REST API routes: history list, version diff, revert
- arc-cms admin history viewer UI with field diffs and revert modal
- TypeScript types for `ArcVersion` and `VersioningConfig`
- Error resilience: snapshot failures never crash the app
