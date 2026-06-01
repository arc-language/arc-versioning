import CmsLayout from "site/cms/CmsLayout.arc"

page "Record History - Admin"

  @param model
  @param id

  @server fn getHistory(modelName: String, recordId: String, page: Number, includeTotal: Boolean) -> Any
    if !session || (session.role !== "admin" && session.role !== "editor")
      return { error: "forbidden", versions: [], hasMore: false, page: 1, total: 0 }
    const _allowed = new Set(Object.keys(db).filter(m => !m.startsWith('_arc_') && typeof db[m]?.update === 'function'))
    if !_allowed.has(modelName)
      return { error: "Unknown model", versions: [], hasMore: false, page: 1, total: 0 }
    try
      const limit = 20
      const offset = (page - 1) * limit
      const rows = db._arc_versions.findMany({
        where: { modelName, recordId },
        orderBy: { id: "desc" },
        limit: limit + 1,
        offset
      })
      const hasMore = rows.length > limit
      const versions = rows.slice(0, limit)
      const userIds = [...new Set(versions.map(v => v.userId).filter(Boolean))]
      const users = userIds.length
        ? db.users.findMany({ where: { id: { in: userIds } }, limit: Math.min(userIds.length, 20) })
        : []
      const userMap = Object.fromEntries(users.map(u => [String(u.id), u.name || u.email || "Unknown"]))
      const total = includeTotal ? db._arc_versions.count({ where: { modelName, recordId } }) : 0
      return {
        versions: versions.map(v => ({ ...v, userName: userMap[String(v.userId)] || null })),
        hasMore,
        page,
        total
      }
    catch e
      return { error: "Failed to load history", versions: [], hasMore: false, page: 1, total: 0 }

  @server fn getVersionDiff(versionId: String, modelName: String, recordId: String) -> Any
    if !session || (session.role !== "admin" && session.role !== "editor")
      return { error: "forbidden", diff: [] }
    const _allowed = new Set(Object.keys(db).filter(m => !m.startsWith('_arc_') && typeof db[m]?.update === 'function'))
    if !_allowed.has(modelName)
      return { error: "Unknown model", diff: [] }
    const _diffVid = Number(versionId)
    if !Number.isInteger(_diffVid) || _diffVid <= 0
      return { error: "Invalid versionId", diff: [] }
    const ver = db._arc_versions.find(versionId)
    if !ver return { error: "Not found", diff: [] }
    if ver.modelName !== modelName || ver.recordId !== recordId
      return { error: "Version mismatch", diff: [] }
    const prev = db._arc_versions.findMany({
      where: { modelName, recordId, id: { lt: Number(versionId) } },
      orderBy: { id: "desc" },
      limit: 1
    })
    let prevData = {}
    let currData = {}
    try
      prevData = prev.length ? JSON.parse(prev[0].data || "{}") : {}
      currData = JSON.parse(ver.data || "{}")
    catch
      return { error: "Version data is corrupt", diff: [] }
    const skip = new Set(["id", "createdAt", "updatedAt"])
    const allKeys = [...new Set([...Object.keys(prevData), ...Object.keys(currData)])].filter(k => !skip.has(k))
    const diff = allKeys
      .filter(k => JSON.stringify(prevData[k]) !== JSON.stringify(currData[k]))
      .map(k => ({ field: k, from: prevData[k] ?? null, to: currData[k] ?? null }))
    return { diff, version: ver }

  @server fn revertToVersion(versionId: String, modelName: String, recordId: String) -> Any
    if !session || (session.role !== "admin" && session.role !== "editor")
      return { error: "forbidden" }
    const _allowed = new Set(Object.keys(db).filter(m => !m.startsWith('_arc_') && typeof db[m]?.update === 'function'))
    if !_allowed.has(modelName)
      return { error: "Unknown model" }
    const ver = db._arc_versions.find(versionId)
    if !ver return { error: "Version not found" }
    if ver.modelName !== modelName || ver.recordId !== recordId
      return { error: "Version mismatch" }
    let snapshot = {}
    try
      snapshot = JSON.parse(ver.data || "{}")
    catch
      return { error: "Version data is corrupt" }
    const { id, createdAt, updatedAt, ...fields } = snapshot
    try
      return _db.transaction(() => {
        db[modelName].update(recordId, fields)
        db._arc_versions.create({
          modelName,
          recordId,
          action: "revert",
          data: ver.data,
          userId: session?.userId ?? null,
          createdAt: new Date().toISOString()
        })
        return { ok: true }
      })()
    catch e
      return { error: e?.message || "Revert failed" }

  @live const historyData = getHistory(model, id, 1, true)

  @state let page = 1
  @state let versions = historyData.versions
  @state let hasMore = historyData.hasMore
  @state let historyError = historyData.error || ""
  @state let expandedId = ""
  @state let diffLoadingId = ""
  @state let diffData = {}
  @state let confirmId = ""
  @state let reverting = false
  @state let revertDone = false
  @state let revertError = ""
  @state let total = historyData.total
  @state let loadingMore = false
  @state let loadMoreError = ""
  @state let diffError = ""

  CmsLayout title="Version History" active=""
    col gap="20px"
      row align="center" justify="space-between"
        col gap="2px"
          text class="history-title" "Version History"
          if historyError == ""
            text class="history-meta" "Model: {model} · Record #{id} · {total} versions total"
          if historyError != ""
            text class="history-meta" "Model: {model} · Record #{id}"

      if historyError == "forbidden"
        col class="!card history-error-state" p="24px" gap="8px" align="center"
          text class="history-error-msg" "You do not have permission to view version history."

      if historyError != "" && historyError != "forbidden"
        col class="!card history-error-state" p="24px" gap="8px" align="center"
          text class="history-error-msg" "Failed to load history. Please refresh."

      if historyError == "" && versions.length == 0
        col class="!card history-empty" p="40px 24px" align="center" gap="8px"
          text class="history-empty-icon" "🕐"
          text class="history-empty-title" "No history yet"
          text class="history-empty-sub" "Changes will appear here automatically."

      if historyError == "" && versions.length > 0
        col class="!card" gap="0"
          for v in versions
            col class="history-entry" gap="0"
              row class="history-entry-header" p="14px 20px" gap="12px" align="center"
                col class="history-badge-wrap"
                  if v.action == "create"
                    text class="history-badge history-badge--create" "create"
                  if v.action == "update"
                    text class="history-badge history-badge--update" "update"
                  if v.action == "delete"
                    text class="history-badge history-badge--delete" "delete"
                  if v.action == "revert"
                    text class="history-badge history-badge--revert" "revert"

                col gap="1px"
                  row gap="6px" align="center"
                    if v.userName
                      text class="history-user" "{v.userName}"
                    if !v.userName
                      text class="history-user history-user--anon" "System"
                    text class="history-dot" "·"
                    text class="history-time" title="{v.createdAt}" "{new Date(v.createdAt).toLocaleString()}"

                row class="history-actions" gap="8px" align="center" ml="auto"
                  button class="!btn !btn--ghost !btn--sm" on:click={
                    @diffError = ""
                    if expandedId == String(v.id)
                      @expandedId = ""
                    else if diffData[String(v.id)]
                      @expandedId = String(v.id)
                    else
                      @diffLoadingId = String(v.id)
                      const d = getVersionDiff(String(v.id), model, id)
                      @diffLoadingId = ""
                      if d.error
                        @diffError = d.error
                      else
                        @diffData = { ...diffData, [String(v.id)]: d.diff || [] }
                        @expandedId = String(v.id)
                  }
                    if diffLoadingId == String(v.id) "Loading…" else "Diff"

                  if v.action != "delete"
                    button class="!btn !btn--ghost !btn--sm history-revert-btn" aria-label="Revert to version {v.id}" on:click={
                      @confirmId = String(v.id)
                    } "Revert"

              if expandedId == String(v.id)
                col class="history-diff" p="0 20px 14px 20px" gap="6px"
                  if diffData[String(v.id)] && diffData[String(v.id)].length == 0
                    text class="history-diff-none" "No field changes detected."
                  if diffData[String(v.id)] && diffData[String(v.id)].length > 0
                    for field in diffData[String(v.id)]
                      row class="history-diff-row" gap="8px" align="baseline"
                        text class="history-diff-field" "{field.field}"
                        text class="history-diff-from" title="{field.from}" "{field.from}"
                        text class="history-diff-arrow" "→"
                        text class="history-diff-to" title="{field.to}" "{field.to}"

      if hasMore
        row justify="center" p="8px 0 0 0" gap="8px" direction="column" align="center"
          button class="!btn !btn--ghost" disabled={loadingMore} on:click={
            @loadingMore = true
            @loadMoreError = ""
            const next = page + 1
            const more = getHistory(model, id, next, false)
            @loadingMore = false
            if more.error
              @loadMoreError = "Failed to load more versions."
            else
              @versions = [...versions, ...more.versions]
              @hasMore = more.hasMore
              @page = next
          }
            if loadingMore "Loading…" else "Load more"
          if loadMoreError != ""
            text class="history-load-error" "{loadMoreError}"

      if diffError != ""
        text class="history-load-error" "Diff failed: {diffError}"

      if confirmId != ""
        col class="history-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="history-modal-title" aria-describedby="history-modal-desc" on:keydown={
          if event.key == "Escape"
            @confirmId = ""
            @revertError = ""
        }
          col class="!card history-modal" p="28px" gap="16px"
            text id="history-modal-title" class="history-modal-title" "Revert to this version?"
            text id="history-modal-desc" class="history-modal-body" "The record will be restored to the snapshot from this version. A new revert entry will be added to the history so nothing is lost."

            if revertError != ""
              text class="history-modal-error" "{revertError}"

            row gap="10px" justify="flex-end"
              button class="!btn !btn--ghost" autofocus disabled={reverting} on:click={
                @confirmId = ""
                @revertError = ""
              } "Cancel"
              button class="!btn !btn--primary" disabled={reverting} on:click={
                @reverting = true
                @revertError = ""
                const r = revertToVersion(confirmId, model, id)
                @reverting = false
                if r.ok
                  @confirmId = ""
                  @revertDone = true
                  const refreshed = getHistory(model, id, 1, true)
                  if !refreshed.error
                    @versions = refreshed.versions
                    @hasMore = refreshed.hasMore
                    @page = 1
                    @total = refreshed.total
                else
                  @revertError = r.error ?? "Revert failed"
              }
                if reverting "Restoring…" else "Restore this version"

      if revertDone
        row class="!card history-toast" p="12px 16px" gap="8px" align="center"
          text class="history-toast-text" "✓ Version restored."
          button class="!btn !btn--ghost !btn--sm" on:click={ @revertDone = false } "Dismiss"

  design
    .history-title
      font-size: 18px
      font-weight: 700
      color: var(--ui-fg, #050d1f)
    .history-meta
      font-size: 12px
      color: var(--ui-fg-3, #a3a3a3)
    .history-entry
      border-bottom: 1px solid var(--ui-border, #e2e8f0)
    .history-entry:last-child
      border-bottom: none
    .history-entry-header
      transition: background 0.1s
    .history-entry-header:hover
      background: var(--ui-bg-2, #f8fafc)
    .history-badge
      display: inline-block
      font-size: 11px
      font-weight: 600
      padding: 2px 8px
      border-radius: 99px
      text-transform: uppercase
      letter-spacing: 0.04em
      white-space: nowrap
    .history-badge--create
      background: #dcfce7
      color: #15803d
    .history-badge--update
      background: #dbeafe
      color: #1d4ed8
    .history-badge--delete
      background: #fee2e2
      color: #b91c1c
    .history-badge--revert
      background: #f3e8ff
      color: #7e22ce
    .history-badge-wrap
      min-width: 64px
    .history-user
      font-size: 13px
      font-weight: 500
      color: var(--ui-fg, #050d1f)
    .history-user--anon
      color: var(--ui-fg-3, #a3a3a3)
      font-style: italic
    .history-dot
      color: var(--ui-fg-3, #a3a3a3)
      font-size: 12px
    .history-time
      font-size: 12px
      color: var(--ui-fg-3, #a3a3a3)
    .history-revert-btn
      opacity: 0
      transition: opacity 0.15s
    .history-entry-header:hover .history-revert-btn
      opacity: 1
    .history-entry-header:focus-within .history-revert-btn
      opacity: 1
    .history-diff
      background: var(--ui-bg-2, #f8fafc)
      border-top: 1px solid var(--ui-border, #e2e8f0)
    .history-diff-none
      font-size: 12px
      color: var(--ui-fg-3, #a3a3a3)
      font-style: italic
    .history-diff-row
      font-size: 12px
      padding: 2px 0
    .history-diff-field
      font-weight: 600
      color: var(--ui-fg-2, #525252)
      min-width: 120px
    .history-diff-from
      color: #b91c1c
      background: #fee2e2
      padding: 0 4px
      border-radius: 3px
      font-family: monospace
      max-width: 260px
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
      cursor: help
    .history-diff-arrow
      color: var(--ui-fg-3, #a3a3a3)
    .history-diff-to
      color: #15803d
      background: #dcfce7
      padding: 0 4px
      border-radius: 3px
      font-family: monospace
      max-width: 260px
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
      cursor: help
    .history-empty
      text-align: center
    .history-empty-icon
      font-size: 32px
    .history-empty-title
      font-size: 15px
      font-weight: 600
      color: var(--ui-fg-2, #525252)
    .history-empty-sub
      font-size: 13px
      color: var(--ui-fg-3, #a3a3a3)
    .history-error-state
      text-align: center
    .history-error-msg
      font-size: 14px
      color: #b91c1c
    .history-load-error
      font-size: 12px
      color: #b91c1c
    .history-modal-overlay
      position: fixed
      inset: 0
      background: rgba(5, 13, 31, 0.5)
      z-index: 100
      display: flex
      align-items: center
      justify-content: center
    .history-modal
      width: 100%
      max-width: 440px
      margin: 16px
    .history-modal-title
      font-size: 16px
      font-weight: 700
      color: var(--ui-fg, #050d1f)
    .history-modal-body
      font-size: 14px
      color: var(--ui-fg-2, #525252)
      line-height: 1.55
    .history-modal-error
      font-size: 13px
      color: #ef4444
    .history-toast
      background: #f0fdf4
      border: 1px solid #86efac
      border-radius: 8px
    .history-toast-text
      font-size: 13px
      color: #15803d
      font-weight: 500
