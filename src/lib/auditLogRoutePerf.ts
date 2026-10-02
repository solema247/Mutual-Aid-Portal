/**
 * Development-only timing for GET /api/audit-logs.
 * Enable with AUDIT_LOG_ROUTE_PERF=1. Does not alter responses.
 */

export type AuditLogDbOpCategory =
  | 'auth'
  | 'prequery'
  | 'list'
  | 'count'
  | 'enrichment'
  | 'other'

export type AuditLogDbOpRecord = {
  name: string
  category: AuditLogDbOpCategory
  duration_ms: number
  row_count: number | null
  ok: boolean
}

export type AuditLogRoutePerfSnapshot = {
  total_ms: number
  stages_ms: Record<string, number>
  db_ops: AuditLogDbOpRecord[]
  db_call_totals: {
    total: number
    prequery: number
    list: number
    count: number
    enrichment: number
    auth: number
    other: number
  }
  count_mode: 'derived' | 'db' | 'skipped_empty' | 'unknown'
  meta: Record<string, string | number | boolean | null>
}

export class AuditLogRoutePerf {
  private readonly startedAt = performance.now()
  private stagesMs: Record<string, number> = {}
  private dbOps: AuditLogDbOpRecord[] = []

  static enabled(): boolean {
    return process.env.AUDIT_LOG_ROUTE_PERF === '1'
  }

  static maybeCreate(): AuditLogRoutePerf | null {
    return AuditLogRoutePerf.enabled() ? new AuditLogRoutePerf() : null
  }

  addStage(name: string, durationMs: number): void {
    this.stagesMs[name] = Math.round(durationMs * 100) / 100
  }

  recordDbOp(record: AuditLogDbOpRecord): void {
    this.dbOps.push({
      ...record,
      duration_ms: Math.round(record.duration_ms * 100) / 100,
    })
  }

  async timeStage<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now()
    try {
      return await fn()
    } finally {
      this.addStage(name, performance.now() - t0)
    }
  }

  timeStageSync<T>(name: string, fn: () => T): T {
    const t0 = performance.now()
    try {
      return fn()
    } finally {
      this.addStage(name, performance.now() - t0)
    }
  }

  async timeDb<T>(
    name: string,
    category: AuditLogDbOpCategory,
    fn: () => Promise<T>,
    rowCount: (result: T) => number | null
  ): Promise<T> {
    const t0 = performance.now()
    let ok = true
    try {
      const result = await fn()
      const count = rowCount(result)
      this.recordDbOp({
        name,
        category,
        duration_ms: performance.now() - t0,
        row_count: count,
        ok: true,
      })
      return result
    } catch {
      ok = false
      this.recordDbOp({
        name,
        category,
        duration_ms: performance.now() - t0,
        row_count: null,
        ok,
      })
      throw new Error(`audit log db op failed: ${name}`)
    }
  }

  finish(extra: {
    count_mode: AuditLogRoutePerfSnapshot['count_mode']
    meta?: Record<string, string | number | boolean | null>
  }): AuditLogRoutePerfSnapshot {
    const totals = {
      total: this.dbOps.length,
      prequery: 0,
      list: 0,
      count: 0,
      enrichment: 0,
      auth: 0,
      other: 0,
    }
    for (const op of this.dbOps) {
      totals[op.category] += 1
      totals.total = this.dbOps.length
    }

    return {
      total_ms: Math.round((performance.now() - this.startedAt) * 100) / 100,
      stages_ms: { ...this.stagesMs },
      db_ops: [...this.dbOps],
      db_call_totals: totals,
      count_mode: extra.count_mode,
      meta: extra.meta ?? {},
    }
  }

  /** Safe structured log — no search terms, emails, or row payloads. */
  logSnapshot(label: string, snapshot: AuditLogRoutePerfSnapshot): void {
    console.info(
      JSON.stringify({
        tag: 'audit_log_route_perf',
        label,
        ...snapshot,
      })
    )
  }
}
