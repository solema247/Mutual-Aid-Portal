import type { SupabaseClient } from '@supabase/supabase-js'

type FilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'ilike'
  | 'is'
  | 'in'
  | 'contains'
  | 'containedBy'
  | 'rangeGt'
  | 'rangeGte'
  | 'rangeLt'
  | 'rangeLte'
  | 'rangeAdjacent'
  | 'overlaps'
  | 'textSearch'
  | 'match'
  | 'not'
  | 'or'
  | 'filter'

type WriteOp = 'insert' | 'update' | 'upsert' | 'delete'

type Filter = { op: FilterOp; args: unknown[] }

const ID_KEYS = ['id', 'expense_id'] as const

const FILTER_OPS = new Set<string>([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'rangeGt',
  'rangeGte',
  'rangeLt',
  'rangeLte',
  'rangeAdjacent',
  'overlaps',
  'textSearch',
  'match',
  'not',
  'or',
  'filter',
])

function mergeRowIds(row: unknown, returned: unknown): unknown {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row
  if (!returned || typeof returned !== 'object' || Array.isArray(returned)) return row
  const out = { ...(row as Record<string, unknown>) }
  const ret = returned as Record<string, unknown>
  for (const key of ID_KEYS) {
    if (ret[key] != null) out[key] = ret[key]
  }
  return out
}

/** Copy primary-generated ids onto the secondary insert/upsert payload. */
function mergeReturnedIds(payload: unknown, data: unknown): unknown {
  if (payload == null || data == null) return payload

  if (Array.isArray(payload) && Array.isArray(data)) {
    return payload.map((row, i) => mergeRowIds(row, data[i]))
  }

  if (Array.isArray(payload) && payload.length === 1 && !Array.isArray(data)) {
    return [mergeRowIds(payload[0], data)]
  }

  if (!Array.isArray(payload) && !Array.isArray(data)) {
    return mergeRowIds(payload, data)
  }

  return payload
}

function applyFilters(builder: any, filters: Filter[]) {
  let b = builder
  for (const f of filters) {
    const fn = b[f.op]
    if (typeof fn === 'function') {
      b = fn.apply(b, f.args)
    }
  }
  return b
}

async function runSecondary(
  secondary: SupabaseClient,
  table: string,
  writeOp: WriteOp,
  payload: unknown,
  options: unknown,
  filters: Filter[]
) {
  let builder: any = secondary.from(table)
  if (writeOp === 'insert') {
    builder = builder.insert(payload, options as any)
  } else if (writeOp === 'update') {
    builder = builder.update(payload, options as any)
  } else if (writeOp === 'upsert') {
    builder = builder.upsert(payload, options as any)
  } else {
    builder = builder.delete(options as any)
  }
  builder = applyFilters(builder, filters)
  const { error } = await builder
  if (error) {
    throw error
  }
}

function createWriteBuilder(
  primaryBuilder: any,
  secondary: SupabaseClient,
  table: string,
  writeOp: WriteOp,
  payload: unknown,
  options: unknown
) {
  const filters: Filter[] = []
  let chain = primaryBuilder

  const api: any = {
    then(onFulfilled: any, onRejected: any) {
      return Promise.resolve(chain)
        .then(async (result: { data?: unknown; error?: unknown }) => {
          if (!result?.error) {
            try {
              let secondaryPayload = payload
              if (
                (writeOp === 'insert' || writeOp === 'upsert') &&
                result.data != null
              ) {
                secondaryPayload = mergeReturnedIds(payload, result.data)
              }
              await runSecondary(
                secondary,
                table,
                writeOp,
                secondaryPayload,
                options,
                filters
              )
            } catch (err) {
              console.error(`[sb] ${table}.${writeOp}`, err)
            }
          }
          return result
        })
        .then(onFulfilled, onRejected)
    },
  }

  return new Proxy(api, {
    get(target, prop, receiver) {
      if (prop === 'then') return target.then

      const key = String(prop)

      if (FILTER_OPS.has(key)) {
        return (...args: unknown[]) => {
          filters.push({ op: key as FilterOp, args })
          chain = chain[key](...args)
          return receiver
        }
      }

      if (typeof chain[key] === 'function') {
        return (...args: unknown[]) => {
          const next = chain[key](...args)
          if (next && typeof next === 'object') {
            chain = next
            return receiver
          }
          return next
        }
      }

      return chain[key]
    },
  })
}

export function pairClients(
  primary: SupabaseClient,
  secondary: SupabaseClient
): SupabaseClient {
  return new Proxy(primary, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) => {
          const primaryFrom = target.from(table)
          return new Proxy(primaryFrom as object, {
            get(fromTarget, fromProp, fromReceiver) {
              const key = String(fromProp)
              if (
                key === 'insert' ||
                key === 'update' ||
                key === 'upsert' ||
                key === 'delete'
              ) {
                return (payloadOrOpts?: unknown, maybeOpts?: unknown) => {
                  const isDelete = key === 'delete'
                  const payload = isDelete ? undefined : payloadOrOpts
                  const options = isDelete ? payloadOrOpts : maybeOpts
                  const primaryBuilder = isDelete
                    ? (fromTarget as any).delete(payloadOrOpts)
                    : (fromTarget as any)[key](payloadOrOpts, maybeOpts)
                  return createWriteBuilder(
                    primaryBuilder,
                    secondary,
                    table,
                    key as WriteOp,
                    payload,
                    options
                  )
                }
              }

              const value = Reflect.get(fromTarget, fromProp, fromReceiver)
              if (typeof value === 'function') {
                return value.bind(fromTarget)
              }
              return value
            },
          })
        }
      }

      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    },
  }) as unknown as SupabaseClient
}
