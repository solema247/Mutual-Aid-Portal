'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

interface NotificationBellProps {
  className?: string
  /** Header variant: use light (white) styling for dark header. */
  variant?: 'default' | 'header'
}

export default function NotificationBell({ className, variant = 'default' }: NotificationBellProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = async (unreadOnly = false) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?limit=20&unread_only=${unreadOnly ? '1' : '0'}`)
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unread_count ?? 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    if (!open) return
    fetchNotifications(false)
  }, [open])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markOneRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch (e) {
      console.error(e)
    }
  }

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true })
      })
      setUnreadCount(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })))
    } catch (e) {
      console.error(e)
    }
  }

  const isHeader = variant === 'header'
  return (
    <div className={cn('relative', className)} ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'relative size-9',
          isHeader
            ? 'text-white hover:text-brand-orange hover:bg-white/10'
            : 'text-muted-foreground hover:text-foreground'
        )}
        aria-label="Notifications"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium',
              isHeader ? 'bg-brand-orange text-white' : 'bg-destructive text-destructive-foreground'
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
      {open && (
        <div
          className={cn(
            'absolute right-0 top-full z-50 mt-1 w-80 rounded-md border bg-background shadow-lg',
            'max-h-[min(24rem,70vh)] overflow-y-auto'
          )}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const content = (
                  <>
                    <div className={cn('font-medium', !n.read_at && 'text-foreground')}>{n.title}</div>
                    {n.body && <div className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</div>}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </>
                )
                const handleClick = () => {
                  setOpen(false)
                  if (!n.read_at) markOneRead(n.id)
                }
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} className="block px-3 py-2 text-sm hover:bg-muted/50" onClick={handleClick}>
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="w-full text-left block px-3 py-2 text-sm hover:bg-muted/50"
                        onClick={handleClick}
                      >
                        {content}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
