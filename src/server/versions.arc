@group "/admin/api" @auth(admin,editor)

  @route get "/versions/:model/:id" -> Response
    const _allowed = new Set(Object.keys(db).filter(m => !m.startsWith('_arc_') && typeof db[m]?.update === 'function'))
    if !_allowed.has(params.model)
      return json({ error: "Unknown model" }, 400)
    const page = Math.max(1, parseInt(request.query?.page, 10) || 1)
    const limit = 20
    const offset = (page - 1) * limit
    const rows = db._arc_versions.findMany({
      where: { modelName: params.model, recordId: params.id },
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
    const userMap = Object.fromEntries(users.map(u => [String(u.id), u.name || u.email || null]))
    json({ versions: versions.map(v => ({ ...v, userName: userMap[String(v.userId)] || null })), hasMore, page })

  @route get "/versions/:model/:id/:versionId" -> Response
    const _allowed2 = new Set(Object.keys(db).filter(m => !m.startsWith('_arc_') && typeof db[m]?.update === 'function'))
    if !_allowed2.has(params.model)
      return json({ error: "Unknown model" }, 400)
    const _vid = Number(params.versionId)
    if !Number.isInteger(_vid) || _vid <= 0
      return json({ error: "Invalid versionId" }, 400)
    const ver = db._arc_versions.find(params.versionId)
    if !ver
      return json({ error: "Version not found" }, 404)
    if ver.modelName !== params.model || ver.recordId !== params.id
      return json({ error: "Version does not match record" }, 400)
    const prev = db._arc_versions.findMany({
      where: { modelName: params.model, recordId: params.id, id: { lt: Number(params.versionId) } },
      orderBy: { id: "desc" },
      limit: 1
    })
    let prevData = {}
    let currData = {}
    try
      prevData = prev.length ? JSON.parse(prev[0].data || "{}") : {}
      currData = JSON.parse(ver.data || "{}")
    catch
      return json({ error: "Version data is corrupt" }, 500)
    const skipFields = new Set(["id", "createdAt", "updatedAt"])
    const allKeys = [...new Set([...Object.keys(prevData), ...Object.keys(currData)])].filter(k => !skipFields.has(k))
    const diff = allKeys
      .filter(k => JSON.stringify(prevData[k]) !== JSON.stringify(currData[k]))
      .map(k => ({ field: k, from: prevData[k] ?? null, to: currData[k] ?? null }))
    json({ version: ver, diff })

  @route post "/versions/:model/:id/revert/:versionId" -> Response
    const _allowed3 = new Set(Object.keys(db).filter(m => !m.startsWith('_arc_') && typeof db[m]?.update === 'function'))
    if !_allowed3.has(params.model)
      return json({ error: "Unknown model" }, 400)
    const _revertVid = Number(params.versionId)
    if !Number.isInteger(_revertVid) || _revertVid <= 0
      return json({ error: "Invalid versionId" }, 400)
    const ver = db._arc_versions.find(params.versionId)
    if !ver
      return json({ error: "Version not found" }, 404)
    if ver.modelName !== params.model || ver.recordId !== params.id
      return json({ error: "Version does not match record" }, 400)
    let snapshot = {}
    try
      snapshot = JSON.parse(ver.data || "{}")
    catch
      return json({ error: "Version data is corrupt" }, 500)
    const { id, createdAt, updatedAt, ...fields } = snapshot
    let _revertResult
    try
      _revertResult = _db.transaction(() => {
        db[params.model].update(params.id, fields)
        db._arc_versions.create({
          modelName: params.model,
          recordId: params.id,
          action: "revert",
          data: ver.data,
          userId: session?.userId ?? null,
          createdAt: new Date().toISOString()
        })
        return { ok: true, revertedToVersionId: Number(params.versionId) }
      })()
    catch e
      return json({ error: "Revert failed" }, 500)
    json(_revertResult)
