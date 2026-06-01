'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')

// ── package API tests ──────────────────────────────────────────────────────────

describe('arc-versioning package index', () => {
  const pkg = require('../src/index')

  it('exports serverDir pointing to src/server', () => {
    assert.ok(typeof pkg.serverDir === 'string', 'serverDir not exported')
    assert.ok(pkg.serverDir.endsWith(path.join('src', 'server')), 'serverDir wrong path')
    assert.ok(fs.existsSync(pkg.serverDir), 'serverDir does not exist on disk')
  })

  it('exports pagesDir pointing to src/pages', () => {
    assert.ok(typeof pkg.pagesDir === 'string', 'pagesDir not exported')
    assert.ok(pkg.pagesDir.endsWith(path.join('src', 'pages')), 'pagesDir wrong path')
    assert.ok(fs.existsSync(pkg.pagesDir), 'pagesDir does not exist on disk')
  })

  it('exports pagesMountPath as "admin"', () => {
    assert.equal(pkg.pagesMountPath, 'admin')
  })

  it('exports a semver version string', () => {
    assert.ok(typeof pkg.version === 'string', 'version not exported')
    assert.match(pkg.version, /^\d+\.\d+\.\d+/, 'version not semver')
  })
})

// ── server routes file tests ───────────────────────────────────────────────────

describe('src/server/versions.arc', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/server/versions.arc'), 'utf8')

  it('file exists', () => {
    assert.ok(src.length > 0, 'versions.arc is empty')
  })

  it('defines a route group at /admin/api', () => {
    assert.ok(src.includes('@group "/admin/api"'), 'route group missing')
  })

  it('has auth annotation on the group', () => {
    assert.ok(src.includes('@auth(admin,editor)'), 'auth annotation missing')
  })

  it('defines GET history route', () => {
    assert.ok(src.includes('@route get "/versions/:model/:id"'), 'GET history route missing')
  })

  it('defines GET single version route', () => {
    assert.ok(src.includes('@route get "/versions/:model/:id/:versionId"'), 'GET single version route missing')
  })

  it('defines POST revert route', () => {
    assert.ok(src.includes('@route post "/versions/:model/:id/revert/:versionId"'), 'POST revert route missing')
  })

  it('history route paginates with limit 20', () => {
    assert.ok(src.includes('limit: limit + 1'), 'pagination limit missing')
    assert.ok(src.includes('hasMore'), 'hasMore flag missing')
  })

  it('history route enriches with user display name', () => {
    assert.ok(src.includes('userMap'), 'user enrichment missing')
    assert.ok(src.includes('userName'), 'userName field missing')
  })

  it('revert route creates a new version entry with action "revert"', () => {
    assert.ok(src.includes('"revert"'), 'revert action value missing')
    assert.ok(src.includes('db._arc_versions.create'), 'revert snapshot create missing')
  })

  it('revert route validates model and recordId match', () => {
    assert.ok(src.includes('ver.modelName !== params.model'), 'model mismatch check missing')
    assert.ok(src.includes('ver.recordId !== params.id'), 'recordId mismatch check missing')
  })

  it('all three routes use model allowlist to prevent injection', () => {
    assert.ok(src.includes("typeof db[m]?.update === 'function'"), 'allowlist type guard missing')
    const allowlistCount = (src.match(/_allowed\d*\.has\(/g) || []).length
    assert.ok(allowlistCount >= 3, `expected allowlist check on all 3 routes, found ${allowlistCount}`)
  })

  it('revert route wraps update and audit in an invoked transaction', () => {
    assert.ok(src.includes('_db.transaction('), 'transaction call missing')
    assert.ok(src.includes('})()'), 'transaction must be immediately invoked')
  })

  it('revert route catches transaction errors', () => {
    assert.ok(src.includes("Revert failed"), 'transaction error handler missing')
  })

  it('validates versionId is a positive integer on diff and revert routes', () => {
    assert.ok(src.includes('Number.isInteger'), 'versionId integer check missing')
    assert.ok(src.includes("Invalid versionId"), 'versionId error response missing')
  })

  // ── Round 1 gaps ────────────────────────────────────────────────────────────

  it('revert route strips id/createdAt/updatedAt from snapshot before db.update (gap-009)', () => {
    assert.ok(
      src.includes('const { id, createdAt, updatedAt, ...fields } = snapshot'),
      'snapshot field strip missing — revert would overwrite primary key with historic id'
    )
  })

  it('diff route returns 400 when versionId does not match model+recordId (gap-003)', () => {
    assert.ok(
      src.includes('return json({ error: "Version does not match record" }, 400)'),
      'mismatch 400 response missing on diff route'
    )
  })

  it('all version-lookup routes return 404 when record is not found (gap-002)', () => {
    assert.ok(
      src.includes('return json({ error: "Version not found" }, 404)'),
      '404 response missing for not-found version'
    )
  })

  it('routes return 500 with "Version data is corrupt" on JSON.parse failure (gap-004)', () => {
    assert.ok(
      src.includes('return json({ error: "Version data is corrupt" }, 500)'),
      'corrupt-data 500 response missing'
    )
  })

  // ── Round 2 gaps ────────────────────────────────────────────────────────────

  it('all routes return 400 "Unknown model" for non-allowlisted model names (gap-001)', () => {
    assert.ok(
      src.includes('return json({ error: "Unknown model" }, 400)'),
      'Unknown model 400 response missing'
    )
  })

  it('diff route excludes id/createdAt/updatedAt from field comparison (gap-013)', () => {
    assert.ok(
      src.includes('const skipFields = new Set(["id", "createdAt", "updatedAt"])'),
      'skipFields set missing — internal fields would appear as noise in diffs'
    )
  })

  // ── Round 3 gaps ────────────────────────────────────────────────────────────

  it('history route clamps page to minimum 1 with Math.max (gap-006)', () => {
    assert.ok(
      src.includes('Math.max(1, parseInt(request.query?.page, 10) || 1)'),
      'page clamping missing — page=0 or page=-1 would produce negative offset'
    )
  })

  it('history route calculates offset as (page - 1) * limit (gap-005)', () => {
    assert.ok(
      src.includes('const offset = (page - 1) * limit'),
      'offset formula missing'
    )
  })

  it('revert audit entry uses session?.userId with null fallback (gap-010)', () => {
    assert.ok(
      src.includes('userId: session?.userId ?? null'),
      'nullable userId fallback missing — anonymous reverts must record null not undefined'
    )
  })

  // ── Round 6 gaps (versions.arc) ─────────────────────────────────────────────

  it('userMap falls back to email then null when name is absent (gap-012)', () => {
    assert.ok(src.includes('u.name || u.email || null'), 'name/email/null fallback chain missing')
  })

  // ── Round 4 gaps ────────────────────────────────────────────────────────────

  it('history response includes page field for client cursor tracking (gap-007)', () => {
    assert.ok(
      src.includes('json({ versions: versions.map(v => ({ ...v, userName: userMap[String(v.userId)] || null })), hasMore, page })'),
      'page field missing from history response shape'
    )
  })

  it('revert response includes revertedToVersionId field (gap-008)', () => {
    assert.ok(
      src.includes('revertedToVersionId: Number(params.versionId)'),
      'revertedToVersionId missing from revert success response'
    )
  })
})

// ── history page file tests ────────────────────────────────────────────────────

describe('src/pages/history/[model]/[id].arc', () => {
  const pagePath = path.join(__dirname, '../src/pages/history/[model]/[id].arc')
  const src = fs.readFileSync(pagePath, 'utf8')

  it('file exists', () => {
    assert.ok(src.length > 0, 'history page is empty')
  })

  it('declares @param model and @param id', () => {
    assert.ok(src.includes('@param model'), '@param model missing')
    assert.ok(src.includes('@param id'), '@param id missing')
  })

  it('uses CmsLayout', () => {
    assert.ok(src.includes('import CmsLayout'), 'CmsLayout import missing')
    assert.ok(src.includes('CmsLayout'), 'CmsLayout usage missing')
  })

  it('loads history via getHistory server fn', () => {
    assert.ok(src.includes('@server fn getHistory'), 'getHistory fn missing')
    assert.ok(src.includes('db._arc_versions.findMany'), 'findMany call missing')
  })

  it('has revertToVersion server fn', () => {
    assert.ok(src.includes('@server fn revertToVersion'), 'revertToVersion fn missing')
  })

  it('revertToVersion guards against non-admin/editor', () => {
    assert.ok(src.includes("session.role !== \"admin\""), 'role check missing')
    assert.ok(src.includes("session.role !== \"editor\""), 'editor role check missing')
  })

  it('getHistory and getVersionDiff guard against non-admin/editor', () => {
    assert.ok(src.includes('@server fn getHistory'), 'getHistory fn missing')
    assert.ok(src.includes('@server fn getVersionDiff'), 'getVersionDiff fn missing')
    const getHistoryIdx = src.indexOf('@server fn getHistory')
    const getVersionDiffIdx = src.indexOf('@server fn getVersionDiff')
    const revertIdx = src.indexOf('@server fn revertToVersion')
    const historyGuard = src.slice(getHistoryIdx, getVersionDiffIdx)
    const diffGuard = src.slice(getVersionDiffIdx, revertIdx)
    assert.ok(historyGuard.includes('session.role !== "admin"'), 'getHistory auth guard missing')
    assert.ok(diffGuard.includes('session.role !== "admin"'), 'getVersionDiff auth guard missing')
  })

  it('all three server fns use model allowlist to prevent injection', () => {
    assert.ok(src.includes("typeof db[m]?.update === 'function'"), 'allowlist type guard missing')
    const allowlistCount = (src.match(/_allowed\.has\(/g) || []).length
    assert.ok(allowlistCount >= 3, `expected allowlist on all 3 server fns, found ${allowlistCount}`)
  })

  it('revertToVersion wraps update and audit in an invoked transaction', () => {
    assert.ok(src.includes('_db.transaction('), 'transaction call missing')
    assert.ok(src.includes('})()'), 'transaction must be immediately invoked')
  })

  it('revertToVersion catches transaction errors', () => {
    assert.ok(src.includes('Revert failed'), 'transaction error handler missing')
  })

  it('getVersionDiff validates versionId is a positive integer', () => {
    assert.ok(src.includes('Number.isInteger'), 'versionId integer check missing')
    assert.ok(src.includes("Invalid versionId"), 'versionId error response missing')
  })

  it('total version count is tracked in state and refreshed after revert', () => {
    assert.ok(src.includes('@state let total'), 'total state var missing')
    assert.ok(src.includes('@total = refreshed.total'), 'total not refreshed after revert')
  })

  it('revert on:click uses server error message', () => {
    assert.ok(src.includes('r.error ?? "Revert failed"'), 'revert error fallback missing')
  })

  it('shows distinct forbidden vs generic error messages', () => {
    assert.ok(src.includes('historyError == "forbidden"'), 'forbidden state check missing')
    assert.ok(src.includes('You do not have permission'), 'forbidden message missing')
  })

  it('modal has Escape key handler and autofocus on cancel', () => {
    assert.ok(src.includes('event.key == "Escape"'), 'Escape handler missing')
    assert.ok(src.includes('autofocus'), 'autofocus missing')
  })

  it('renders action badges for all four action types', () => {
    assert.ok(src.includes('history-badge--create'), 'create badge missing')
    assert.ok(src.includes('history-badge--update'), 'update badge missing')
    assert.ok(src.includes('history-badge--delete'), 'delete badge missing')
    assert.ok(src.includes('history-badge--revert'), 'revert badge missing')
  })

  it('has revert confirmation modal', () => {
    assert.ok(src.includes('confirmId'), 'confirm state missing')
    assert.ok(src.includes('Restore this version'), 'confirm button text missing')
  })

  it('paginates via load-more', () => {
    assert.ok(src.includes('Load more'), 'load more button missing')
    assert.ok(src.includes('hasMore'), 'hasMore check missing')
  })

  // ── Round 1 gaps ────────────────────────────────────────────────────────────

  it('revert button is suppressed for delete-action entries (gap-019)', () => {
    assert.ok(
      src.includes('if v.action != "delete"'),
      'no-revert-on-delete guard missing — delete entries must not have a revert button'
    )
  })

  // ── Round 2 gaps ────────────────────────────────────────────────────────────

  it('getHistory only calls count when includeTotal is true (gap-014)', () => {
    assert.ok(
      src.includes('const total = includeTotal ? db._arc_versions.count({ where: { modelName, recordId } }) : 0'),
      'conditional count missing — count should be skipped on load-more calls'
    )
  })

  it('getHistory catch block returns full error shape with empty arrays (gap-015)', () => {
    assert.ok(
      src.includes('return { error: "Failed to load history", versions: [], hasMore: false, page: 1, total: 0 }'),
      'getHistory catch-all error shape missing'
    )
  })

  it('load-more appends to existing versions rather than replacing them (gap-022)', () => {
    assert.ok(
      src.includes('@versions = [...versions, ...more.versions]'),
      'load-more append-not-replace pattern missing'
    )
  })

  // ── Round 3 gaps ────────────────────────────────────────────────────────────

  it('getVersionDiff returns "Version mismatch" error object with diff array (gap-016)', () => {
    assert.ok(
      src.includes('return { error: "Version mismatch", diff: [] }'),
      'Version mismatch error shape missing in getVersionDiff page fn'
    )
  })

  it('after successful revert page cursor resets to 1 (gap-023)', () => {
    assert.ok(
      src.includes('@page = 1'),
      'page cursor reset after revert missing — load-more would skip the new revert entry'
    )
  })

  // ── Round 4 gaps ────────────────────────────────────────────────────────────

  it('revertToVersion catches transaction errors with e?.message fallback (gap-017)', () => {
    assert.ok(
      src.includes('return { error: e?.message || "Revert failed" }'),
      'transaction error message propagation missing in page server fn'
    )
  })

  it('confirmation modal has full ARIA attributes for screen readers (gap-024)', () => {
    assert.ok(src.includes('role="dialog"'), 'role=dialog missing')
    assert.ok(src.includes('aria-modal="true"'), 'aria-modal missing')
    assert.ok(src.includes('aria-labelledby="history-modal-title"'), 'aria-labelledby missing')
    assert.ok(src.includes('aria-describedby="history-modal-desc"'), 'aria-describedby missing')
  })

  // ── Round 5 gaps ────────────────────────────────────────────────────────────

  it('user lookup is capped at Math.min(userIds.length, 20) to prevent unbounded query (gap-011)', () => {
    assert.ok(src.includes('limit: Math.min(userIds.length, 20)'), 'user query cap missing')
  })

  it('load-more button is disabled while loading to prevent duplicate requests (gap-021)', () => {
    assert.ok(src.includes('disabled={loadingMore}'), 'loadingMore disabled guard missing')
  })

  it('diff toggle short-circuits to show cached diff without a server call (gap-028)', () => {
    assert.ok(
      src.includes('else if diffData[String(v.id)]'),
      'diff cache-hit branch missing — every click would fire a new server round-trip'
    )
  })

  // ── Round 6 gaps ────────────────────────────────────────────────────────────

  it('anonymous/system entries show "System" label with anon CSS class (gap-020)', () => {
    assert.ok(src.includes('history-user--anon'), 'anon CSS class missing')
    assert.ok(src.includes('"System"'), 'System label missing for anonymous entries')
  })

  it('modal body discloses that revert preserves history ("nothing is lost") (gap-025)', () => {
    assert.ok(
      src.includes('A new revert entry will be added to the history so nothing is lost'),
      'destructive-action disclosure copy missing from modal'
    )
  })

  it('empty diff state shows "No field changes detected." message (gap-027)', () => {
    assert.ok(src.includes('No field changes detected.'), 'empty diff copy missing')
  })

  // ── Round 7 gaps ────────────────────────────────────────────────────────────

  it('empty state shows "No history yet" copy (gap-018)', () => {
    assert.ok(src.includes('"No history yet"'), 'empty state copy missing')
  })

  it('toast dismiss button clears revertDone state (gap-026)', () => {
    assert.ok(src.includes('@revertDone = false'), 'toast dismiss handler missing')
  })
})

// ── TypeScript type definitions ────────────────────────────────────────────────

describe('TypeScript type definitions', () => {
  const typesPath = path.join(__dirname, '../src/types/index.d.ts')
  const src = fs.readFileSync(typesPath, 'utf8')

  it('types file exists', () => {
    assert.ok(src.length > 0, 'types file is empty')
  })

  it('exports ArcVersion interface with all required fields', () => {
    assert.ok(src.includes('export interface ArcVersion'), 'ArcVersion interface missing')
    assert.ok(src.includes('modelName'), 'modelName missing')
    assert.ok(src.includes('recordId'), 'recordId missing')
    assert.ok(src.includes("'create' | 'update' | 'delete' | 'revert'"), 'action union missing')
    assert.ok(src.includes('createdAt'), 'createdAt missing')
  })

  it('exports VersioningConfig with maxVersionsPerRecord and excludeModels', () => {
    assert.ok(src.includes('export interface VersioningConfig'), 'VersioningConfig missing')
    assert.ok(src.includes('maxVersionsPerRecord'), 'maxVersionsPerRecord missing')
    assert.ok(src.includes('excludeModels'), 'excludeModels missing')
  })

  it('exports ArcConfigWithVersioning', () => {
    assert.ok(src.includes('export interface ArcConfigWithVersioning'), 'ArcConfigWithVersioning missing')
  })

  // ── Round 4 gaps ────────────────────────────────────────────────────────────

  it('ArcVersion.data is typed as nullable string (gap-029)', () => {
    assert.ok(src.includes('data: string | null'), 'data field not nullable — JSON.parse guard relies on this')
  })

  // ── Round 5 gaps ────────────────────────────────────────────────────────────

  it('ArcVersion.id is typed as number not string (gap-034)', () => {
    assert.ok(src.includes('id: number'), 'id must be number type — String(v.id) coercions depend on this')
  })

  it('ArcVersion.userId is typed as nullable string (gap-030)', () => {
    assert.ok(src.includes('userId: string | null'), 'userId must be nullable — anonymous sessions must be representable')
  })

  // ── Round 6 gaps ────────────────────────────────────────────────────────────

  it('ArcVersion.userName is optional and nullable (gap-031)', () => {
    assert.ok(src.includes('userName?: string | null'), 'userName must be optional — raw DB rows omit it')
  })

  // ── Round 7 gaps ────────────────────────────────────────────────────────────

  it('retentionDays is marked @internal and not-yet-implemented (gap-032)', () => {
    assert.ok(src.includes('@internal Not yet implemented'), 'retentionDays @internal annotation missing')
  })

  it('ArcConfigWithVersioning.packages typed as string array (gap-033)', () => {
    assert.ok(src.includes('packages: string[]'), 'packages must be string[] not a union type')
  })
})
