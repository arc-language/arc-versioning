export interface ArcVersion {
  id: number
  modelName: string
  recordId: string
  action: 'create' | 'update' | 'delete' | 'revert'
  /** Raw JSON snapshot string. Use JSON.parse(ver.data ?? '{}') to access fields. */
  data: string | null
  userId: string | null
  createdAt: string
  userName?: string | null  // enriched by history API
}

export interface VersioningConfig {
  /** Max versions stored per record. Older ones are trimmed async. Default: 100 */
  maxVersionsPerRecord?: number
  /** Model table names to exclude from versioning. Default: [] */
  excludeModels?: string[]
  /**
   * @internal Not yet implemented — reserved for a future retention policy.
   * Do not rely on this field having any effect.
   */
  retentionDays?: number | null
}

// arc.config.json shape when arc-versioning is installed
export interface ArcConfigWithVersioning {
  /** Package names as strings, e.g. ["arc-versioning"] */
  packages: string[]
  versioning?: VersioningConfig
}
