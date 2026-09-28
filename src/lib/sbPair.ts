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
        .then(async (result: { error?: unknown }) => {
          if (!result?.error) {
            try {
              await runSecondary(secondary, table, writeOp, payload, options, filters)
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
