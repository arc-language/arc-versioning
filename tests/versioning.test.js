'use strict'

const { describe, it, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

// Load the BunServerEmitter from the main arc source
const { BunServerEmitter } = require(path.join(__dirname, '../../../src/emitters/server-bun'))
const N = require(path.join(__dirname, '../../../src/ast'))

function makeEmitter(opts = {}) {
  return new BunServerEmitter({ hash: 'arc', db: 'sqlite', ...opts })
}

function emptyProgram() {
  return N.Program([], [], 0)
}

// ── _emitVersioningWrapper unit tests ─────────────────────────────────────────

describe('_emitVersioningWrapper', () => {
  it('emits CREATE TABLE IF NOT EXISTS _arc_versions', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes('CREATE TABLE IF NOT EXISTS _arc_versions'), 'table DDL missing')
  })

  it('emits all three required indexes', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes('_arc_versions_record'), 'per-record index missing')
    assert.ok(out.includes('_arc_versions_recent'), 'recency index missing')
    assert.ok(out.includes('_arc_versions_user'), 'user index missing')
  })

  it('always skips _arc_versions itself', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes('"_arc_versions"'), '_arc_versions not in skip set')
    // skip set must include _arc_versions
    const skipMatch = out.match(/_skip = new Set\((\[.*?\])\)/)
    assert.ok(skipMatch, 'skip set declaration not found')
    const skipArr = JSON.parse(skipMatch[1])
    assert.ok(skipArr.includes('_arc_versions'), '_arc_versions not in parsed skip set')
  })

  it('includes excludeModels in the skip set', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({ excludeModels: ['auditlogs', 'sessions'] })
    const skipMatch = out.match(/_skip = new Set\((\[.*?\])\)/)
    assert.ok(skipMatch, 'skip set declaration not found')
    const skipArr = JSON.parse(skipMatch[1])
    assert.ok(skipArr.includes('auditlogs'), 'auditlogs not in skip set')
    assert.ok(skipArr.includes('sessions'), 'sessions not in skip set')
    assert.ok(skipArr.includes('_arc_versions'), '_arc_versions not in skip set')
  })

  it('uses maxVersionsPerRecord default of 100', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes('const _maxV = 100'), 'default maxV not 100')
  })

  it('uses custom maxVersionsPerRecord when provided', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({ maxVersionsPerRecord: 25 })
    assert.ok(out.includes('const _maxV = 25'), 'custom maxV not applied')
    assert.ok(!out.includes('const _maxV = 100'), 'default maxV should not appear')
  })

  it('trims asynchronously via Promise.resolve().then', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes('Promise.resolve().then('), 'async trim pattern missing')
  })

  it('emits create/update/delete wrappers', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes("_snap(_m, r?.id, 'create', r)"), 'create snap missing')
    assert.ok(out.includes("_snap(_m, rid, 'update', r)"), 'update snap missing')
    assert.ok(out.includes("_snap(_m, id, 'delete', before)"), 'delete snap missing')
  })

  it('catches snapshot errors and emits console.warn', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes("console.warn('[arc-versioning] snapshot failed:'"), 'error swallow missing')
  })

  it('delete wrapper captures before-state via find()', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes('before = _o.find(id)'), 'before-state capture missing')
  })

  it('skips models without a create function', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes("typeof _o?.create !== 'function'"), 'create-function guard missing')
  })

  it('registers findMany, find, create, count, delete helpers on _arc_versions', () => {
    const e = makeEmitter()
    const out = e._emitVersioningWrapper({})
    assert.ok(out.includes('findMany:'), 'findMany helper missing')
    assert.ok(out.includes('find:'), 'find helper missing')
    assert.ok(out.includes('create:'), 'create helper missing')
    assert.ok(out.includes('count:'), 'count helper missing')
    assert.ok(out.includes('delete:'), 'delete helper missing')
  })
})

// ── emitProgram integration tests ─────────────────────────────────────────────

describe('emitProgram — versioningEnabled flag', () => {
  it('omits versioning wrapper when versioningEnabled is false (default)', () => {
    const e = makeEmitter({ versioningEnabled: false })
    const out = e.emitProgram(emptyProgram())
    assert.ok(!out.includes('arc-versioning'), 'versioning code emitted when disabled')
    assert.ok(!out.includes('_arc_versions'), '_arc_versions emitted when disabled')
  })

  it('emits versioning wrapper when versioningEnabled is true', () => {
    const e = makeEmitter({ versioningEnabled: true })
    // Need at least one model to get a non-empty emit
    const field = N.ModelField([], 'title', { name: 'String', args: [], nullable: false }, null, 0)
    const schema = N.ModelDecl('Post', [field], 0)
    const prog = N.Program([], [schema], 0)
    const out = e.emitProgram(prog)
    assert.ok(out.includes('arc-versioning'), 'versioning comment missing')
    assert.ok(out.includes('_arc_versions'), '_arc_versions table missing')
    assert.ok(out.includes('_skip'), 'skip set missing')
  })

  it('respects versioningConfig.maxVersionsPerRecord from opts', () => {
    const e = makeEmitter({ versioningEnabled: true, versioningConfig: { maxVersionsPerRecord: 10 } })
    const field = N.ModelField([], 'title', { name: 'String', args: [], nullable: false }, null, 0)
    const schema = N.ModelDecl('Post', [field], 0)
    const prog = N.Program([], [schema], 0)
    const out = e.emitProgram(prog)
    assert.ok(out.includes('const _maxV = 10'), 'custom maxV not in full emit')
  })

  it('respects versioningConfig.excludeModels from opts', () => {
    const e = makeEmitter({ versioningEnabled: true, versioningConfig: { excludeModels: ['logs'] } })
    const field = N.ModelField([], 'title', { name: 'String', args: [], nullable: false }, null, 0)
    const schema = N.ModelDecl('Post', [field], 0)
    const prog = N.Program([], [schema], 0)
    const out = e.emitProgram(prog)
    const skipMatch = out.match(/_skip = new Set\((\[.*?\])\)/)
    assert.ok(skipMatch, 'skip set not found in full emit')
    const skipArr = JSON.parse(skipMatch[1])
    assert.ok(skipArr.includes('logs'), 'excludeModels not applied')
  })
})

// ── package API tests ──────────────────────────────────────────────────────────

describe('arc-versioning package index', () => {
  const pkg = require(path.join(__dirname, '../src/index'))

  it('exports serverDir', () => {
    assert.ok(typeof pkg.serverDir === 'string', 'serverDir not exported')
    assert.ok(pkg.serverDir.endsWith(path.join('src', 'server')), 'serverDir wrong path')
  })

  it('exports pagesDir', () => {
    assert.ok(typeof pkg.pagesDir === 'string', 'pagesDir not exported')
    assert.ok(pkg.pagesDir.endsWith(path.join('src', 'pages')), 'pagesDir wrong path')
  })

  it('exports pagesMountPath as "admin"', () => {
    assert.equal(pkg.pagesMountPath, 'admin')
  })

  it('exports version string', () => {
    assert.ok(typeof pkg.version === 'string', 'version not exported')
    assert.match(pkg.version, /^\d+\.\d+\.\d+/, 'version not semver')
  })
})

// ── TypeScript types surface test ──────────────────────────────────────────────

describe('TypeScript type definitions', () => {
  const fs = require('fs')
  const typesPath = path.join(__dirname, '../src/types/index.d.ts')

  it('types file exists', () => {
    assert.ok(fs.existsSync(typesPath), 'src/types/index.d.ts missing')
  })

  it('exports ArcVersion interface', () => {
    const src = fs.readFileSync(typesPath, 'utf8')
    assert.ok(src.includes('export interface ArcVersion'), 'ArcVersion interface missing')
  })

  it('exports VersioningConfig interface', () => {
    const src = fs.readFileSync(typesPath, 'utf8')
    assert.ok(src.includes('export interface VersioningConfig'), 'VersioningConfig interface missing')
  })

  it('ArcVersion has required fields', () => {
    const src = fs.readFileSync(typesPath, 'utf8')
    assert.ok(src.includes('modelName'), 'modelName field missing')
    assert.ok(src.includes('recordId'), 'recordId field missing')
    assert.ok(src.includes('action'), 'action field missing')
    assert.ok(src.includes("'create' | 'update' | 'delete' | 'revert'"), 'action union type missing')
  })

  it('VersioningConfig has maxVersionsPerRecord and excludeModels', () => {
    const src = fs.readFileSync(typesPath, 'utf8')
    assert.ok(src.includes('maxVersionsPerRecord'), 'maxVersionsPerRecord missing')
    assert.ok(src.includes('excludeModels'), 'excludeModels missing')
  })
})
