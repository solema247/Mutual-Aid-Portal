'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Menu, LogOut } from 'lucide-react'
import { ReactElement } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface SidebarProps {
  items: {
    href: string
    label: string
    icon: string | ReactElement
  }[]
  /** Optional sidebar header title. When not set, uses err:navigation. */
  title?: string
  /** When set, desktop sidebar width is controlled by this (true = expanded, false = collapsed). When undefined, uses hover to expand. */
  isOpen?: boolean
}

export default function Sidebar({ items, title, isOpen }: SidebarProps) {
  const [open, setOpen] = useState(false)
  const [isExpandedHover, setIsExpandedHover] = useState(false)
  const isExpanded = isOpen !== undefined ? isOpen : isExpandedHover
  const pathname = usePathname()
  const { t } = useTranslation(['err', 'common'])
  const sidebarLabel = title ?? t('err:navigation')

  const handleLogout = async () => {
    try {
      // Clear cookies first (before signOut) to prevent redirect loop
      localStorage.clear()
      document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      
      // Sign out from Supabase (await to ensure it completes)
      await supabase.auth.signOut()
      
      // Small delay to ensure cookies are cleared before redirect
      await new Promise(resolve => setTimeout(resolve, 100))
      
      window.location.href = '/login'
    } catch (error) {
      console.error('Logout error:', error)
      // Even if signOut fails, clear cookies and redirect
      localStorage.clear()
      document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      window.location.href = '/login'
    }
  }

  return (
    <>
      {/* Mobile sidebar */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden fixed top-4 left-4 z-50">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <SheetHeader className="p-6 border-b border-sidebar-border">
            <SheetTitle className="text-white">{sidebarLabel}</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-2 p-4 h-[calc(100%-80px)] justify-between">
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-brand-orange hover:text-white',
                    pathname === item.href && 'bg-sidebar-primary text-white border-s-2 border-brand-pink'
                  )}
                >
                  <span className="text-xl text-brand-light-blue">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-colors hover:bg-brand-orange hover:text-white mt-auto"
            >
              <LogOut className="h-5 w-5 text-brand-pink" />
              <span>{t('common:logout')}</span>
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div
        className={cn(
          'hidden lg:flex h-screen flex-col border-r rtl:border-l border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out',
          isExpanded ? 'w-64' : 'w-16'
        )}
        onMouseEnter={isOpen === undefined ? () => setIsExpandedHover(true) : undefined}
        onMouseLeave={isOpen === undefined ? () => setIsExpandedHover(false) : undefined}
      >
        <div className={cn(
          'p-6 border-b border-sidebar-border transition-all duration-300',
          !isExpanded && 'p-4'
        )}>
          <h2 className={cn(
            'text-lg font-semibold text-white transition-all duration-300',
            !isExpanded && 'opacity-0'
          )}>
            {sidebarLabel}
          </h2>
        </div>
        <nav className="flex flex-col gap-2 p-4 h-[calc(100%-80px)] justify-between">
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg transition-all duration-300',
                  !isExpanded ? 'justify-center mx-0.5 w-9 h-9' : 'gap-3 px-3',
                  'py-2 text-sidebar-foreground hover:bg-brand-orange hover:text-white',
                  pathname === item.href && 'bg-sidebar-primary text-white border-s-2 border-brand-pink'
                )}
              >
                <span className={cn(
                  "text-xl",
                  pathname !== item.href && "text-brand-light-blue",
                  !isExpanded && "flex items-center justify-center w-6 h-6"
                )}>{item.icon}</span>
                <span className={cn(
                  'transition-all duration-300',
                  !isExpanded && 'w-0 overflow-hidden opacity-0'
                )}>
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center rounded-lg transition-all duration-300',
              !isExpanded ? 'justify-center mx-0.5 w-9 h-9' : 'gap-3 px-3',
              'py-2 text-sidebar-foreground hover:bg-brand-orange hover:text-white mt-auto'
            )}
          >
            <LogOut className={cn(
              "h-5 w-5 text-brand-pink",
              !isExpanded && "flex items-center justify-center"
            )} />
            <span className={cn(
              'transition-all duration-300',
              !isExpanded && 'w-0 overflow-hidden opacity-0'
            )}>
              {t('common:logout')}
            </span>
          </button>
        </nav>
      </div>
    </>
  )
} 