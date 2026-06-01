@group "/admin/api" @auth(admin,editor)

  @route get "/versions/:model/:id" -> Response
    const page = Number(request.query?.page || 1)
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
      ? db.users.findMany({ where: { id: { in: userIds } } })
      : []
    const userMap = Object.fromEntries(users.map(u => [String(u.id), u.name || u.email || null]))
    json({ versions: versions.map(v => ({ ...v, userName: userMap[String(v.userId)] || null })), hasMore, page })

  @route get "/versions/:model/:id/:versionId" -> Response
    const ver = db._arc_versions.find(params.versionId)
    if !ver
      return json({ error: "Version not found" }, 404)
    if ver.modelName != params.model || ver.recordId != params.id
      return json({ error: "Version does not match record" }, 400)
    const prev = db._arc_versions.findMany({
      where: { modelName: params.model, recordId: params.id, id: { lt: Number(params.versionId) } },
      orderBy: { id: "desc" },
      limit: 1
    })
    const prevData = prev.length ? JSON.parse(prev[0].data || "{}") : {}
    const currData = JSON.parse(ver.data || "{}")
    const allKeys = [...new Set([...Object.keys(prevData), ...Object.keys(currData)])]
    const diff = allKeys
      .filter(k => JSON.stringify(prevData[k]) != JSON.stringify(currData[k]))
      .map(k => ({ field: k, from: prevData[k] ?? null, to: currData[k] ?? null }))
    json({ version: ver, diff })

  @route post "/versions/:model/:id/revert/:versionId" -> Response
    const ver = db._arc_versions.find(params.versionId)
    if !ver
      return json({ error: "Version not found" }, 404)
    if ver.modelName != params.model || ver.recordId != params.id
      return json({ error: "Version does not match record" }, 400)
    const snapshot = JSON.parse(ver.data || "{}")
    const { id, createdAt, updatedAt, ...fields } = snapshot
    db[params.model].update(params.id, fields)
    db._arc_versions.create({
      modelName: params.model,
      recordId: params.id,
      action: "revert",
      data: ver.data,
      userId: session?.userId || null,
      createdAt: new Date().toISOString()
    })
    json({ ok: true, revertedToVersionId: Number(params.versionId) })
