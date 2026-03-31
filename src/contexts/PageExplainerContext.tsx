'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type PageExplainerConfig = {
  /** Short hint for the header icon (browser tooltip / accessibility). */
  tooltip: string
  title: string
  content: ReactNode
  /** When true, open the dialog once when this explainer is first registered while enabled. Default: do not auto-open (use the header ? icon). */
  openOnNavigate?: boolean
}

type PageExplainerContextValue = {
  config: PageExplainerConfig | null
  setConfig: (next: PageExplainerConfig | null) => void
  open: boolean
  setOpen: (v: boolean) => void
  openModal: () => void
}

const PageExplainerContext = createContext<PageExplainerContextValue | null>(null)

export function PageExplainerProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PageExplainerConfig | null>(null)
  const [open, setOpen] = useState(false)

  const openModal = useCallback(() => setOpen(true), [])

  const value = useMemo(
    () => ({
      config,
      setConfig,
      open,
      setOpen,
      openModal,
    }),
    [config, open, openModal]
  )

  return (
    <PageExplainerContext.Provider value={value}>{children}</PageExplainerContext.Provider>
  )
}

export function usePageExplainerContext() {
  const ctx = useContext(PageExplainerContext)
  if (!ctx) {
    throw new Error('usePageExplainerContext must be used within PageExplainerProvider')
  }
  return ctx
}

/**
 * Register page-level explainer content. Clears when `enabled` becomes false (e.g. leave page).
 * Pass a stable `config` (e.g. from useMemo) to avoid unnecessary updates.
 * Optionally auto-opens when `config.openOnNavigate === true` (otherwise the user opens via the header ? icon).
 */
export function useRegisterPageExplainer(
  config: PageExplainerConfig | null,
  enabled: boolean
) {
  const ctx = useContext(PageExplainerContext)
  const autoOpenedRef = useRef(false)
  const configRef = useRef(config)
  configRef.current = config

  useEffect(() => {
    if (!ctx) return
    if (!enabled) {
      autoOpenedRef.current = false
      ctx.setConfig(null)
      ctx.setOpen(false)
    }
  }, [ctx, enabled])

  useEffect(() => {
    if (!ctx || !enabled || !config) return
    ctx.setConfig(config)
  }, [ctx, enabled, config])

  useEffect(() => {
    if (!ctx || !enabled) return
    const c = configRef.current
    if (!c || c.openOnNavigate !== true) return
    if (autoOpenedRef.current) return
    autoOpenedRef.current = true
    const frame = requestAnimationFrame(() => ctx.setOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [ctx, enabled, config])
}
