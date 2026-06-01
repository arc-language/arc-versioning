# Contributing to arc-versioning

Thanks for your interest in contributing!

## Development setup

```bash
git clone https://github.com/arc-language/arc-versioning.git
cd arc-versioning
# No install step — zero dependencies
```

Run tests:

```bash
node --test tests/*.test.js
```

With coverage:

```bash
node --test --experimental-test-coverage tests/*.test.js
```

## Project structure

```
src/
  index.js                        — package entry point
  server/versions.arc             — REST API routes (history, diff, revert)
  pages/history/[model]/[id].arc  — arc-cms admin history viewer UI
  types/index.d.ts                — TypeScript type definitions
tests/
  versioning.test.js              — 25 unit + integration tests
```

## Making changes

- `src/server/versions.arc` — Arc server-side routes. See [Arc docs](https://arc-lang.com/docs) for syntax.
- `src/pages/` — Arc page components rendered by arc-cms.
- The core versioning logic is emitted by `BunServerEmitter._emitVersioningWrapper()` in the main Arc repo.

## Submitting a pull request

1. Fork and create a branch: `git checkout -b my-fix`
2. Make your changes
3. Run tests: `node --test tests/*.test.js`
4. Open a PR against `main`

## Reporting bugs

Use the [bug report template](https://github.com/arc-language/arc-versioning/issues/new?template=bug_report.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
