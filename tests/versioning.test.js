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
    assert.ok(src.includes('ver.modelName != params.model'), 'model mismatch check missing')
    assert.ok(src.includes('ver.recordId != params.id'), 'recordId mismatch check missing')
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
    assert.ok(src.includes("session.role != \"admin\""), 'role check missing')
    assert.ok(src.includes("session.role != \"editor\""), 'editor role check missing')
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
})
