export interface ArcVersion {
  id: number
  modelName: string
  recordId: string
  action: 'create' | 'update' | 'delete' | 'revert'
  data: string | null       // JSON snapshot
  userId: string | null
  createdAt: string
  userName?: string | null  // enriched by history API
}

export interface VersioningConfig {
  /** Max versions stored per record. Older ones are trimmed async. Default: 100 */
  maxVersionsPerRecord?: number
  /** Model table names to exclude from versioning. Default: [] */
  excludeModels?: string[]
  /** Not yet implemented — future retention policy */
  retentionDays?: number | null
}

// arc.config.json shape when arc-versioning is installed
export interface ArcConfigWithVersioning {
  packages: string[]
  versioning?: VersioningConfig
}
