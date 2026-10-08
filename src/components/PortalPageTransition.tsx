'use client'

import LocalizationLoader from '@/components/LocalizationLoader'
import { cn } from '@/lib/utils'
import { usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from 'react'

const FADE_MS = 280
const STUCK_MS = 12000

function normalizePathname(pathname: string): string {
  if (!pathname) return '/'
  let p = pathname
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

function resolveAnchorPath(anchor: HTMLAnchorElement): string | null {
  const raw = anchor.getAttribute('href')
  if (!raw) return null

  if (raw.startsWith('#')) return null

  try {
    const url = new URL(raw, window.location.href)
    if (url.origin !== window.location.origin) return null
    return normalizePathname(url.pathname)
  } catch {
    return null
  }
}

function isErrPortalRouteNavigation(
  anchor: HTMLAnchorElement,
  currentPathname: string,
): boolean {
  if (anchor.hasAttribute('download')) return false
  if (anchor.target === '_blank') return false
  if (anchor.getAttribute('aria-disabled') === 'true') return false
  if (anchor.dataset.portalTransition === 'off') return false

  const raw = anchor.getAttribute('href')
  if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) {
    return false
  }

  const nextPath = resolveAnchorPath(anchor)
  if (!nextPath || !nextPath.startsWith('/err-portal')) return false

  const current = normalizePathname(currentPathname)
  if (nextPath === current) return false

  return true
}

type Phase = 'hidden' | 'shown' | 'fading'

type PortalPageTransitionProps = {
  children: ReactNode
  /**
   * When false, children render with no overlay or navigation listeners.
   * Use for org-specific brand loaders (e.g. Localization Hub only).
   */
  enabled?: boolean
}

export default function PortalPageTransition({
  children,
  enabled = true,
}: PortalPageTransitionProps) {
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const prevPathRef = useRef(pathname)
  const skipInitialPathRef = useRef(true)
  const genRef = useRef(0)
  const phaseRef = useRef<Phase>('hidden')
  const [phase, setPhase] = useState<Phase>('hidden')
  const stuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  pathnameRef.current = pathname
  phaseRef.current = phase

  const clearStuckTimer = useCallback(() => {
    if (stuckTimerRef.current) {
      clearTimeout(stuckTimerRef.current)
      stuckTimerRef.current = null
    }
  }, [])

  const armStuckGuard = useCallback(() => {
    clearStuckTimer()
    const gen = genRef.current
    stuckTimerRef.current = setTimeout(() => {
      if (genRef.current === gen) {
        setPhase('hidden')
      }
    }, STUCK_MS)
  }, [clearStuckTimer])

  const showTransition = useCallback(() => {
    if (!enabled) return
    genRef.current += 1
    setPhase('shown')
    armStuckGuard()
  }, [armStuckGuard, enabled])

  const finishAfterPaint = useCallback((gen: number) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (genRef.current !== gen) return
        setPhase('fading')
      })
    })
  }, [])

  useEffect(() => {
    if (!enabled) {
      clearStuckTimer()
      setPhase('hidden')
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = (event.target as Element | null)?.closest('a[href]') as
        | HTMLAnchorElement
        | null
      if (!anchor) return

      if (!isErrPortalRouteNavigation(anchor, pathnameRef.current)) return

      showTransition()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [enabled, showTransition, clearStuckTimer])

  useEffect(() => {
    if (!enabled) return

    if (skipInitialPathRef.current) {
      skipInitialPathRef.current = false
      prevPathRef.current = pathname
      return
    }

    if (prevPathRef.current === pathname) return

    prevPathRef.current = pathname

    let gen = genRef.current
    if (phaseRef.current === 'hidden') {
      showTransition()
      gen = genRef.current
    }

    finishAfterPaint(gen)
  }, [pathname, enabled, showTransition, finishAfterPaint])

  useEffect(() => () => clearStuckTimer(), [clearStuckTimer])

  if (!enabled) {
    return <>{children}</>
  }

  const overlayVisible = phase !== 'hidden'

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.propertyName !== 'opacity') return
    if (phase === 'fading') {
      clearStuckTimer()
      setPhase('hidden')
    }
  }

  return (
    <>
      {children}
      {overlayVisible ? (
        <div
          className={cn(
            'fixed inset-0 z-[100] flex pointer-events-none items-center justify-center bg-background/55 backdrop-blur-[2px] transition-opacity ease-out',
            phase === 'fading' ? 'opacity-0' : 'opacity-100',
          )}
          style={{ transitionDuration: `${FADE_MS}ms` }}
          aria-busy={phase === 'shown'}
          onTransitionEnd={handleTransitionEnd}
        >
          <LocalizationLoader visible />
        </div>
      ) : null}
    </>
  )
}
