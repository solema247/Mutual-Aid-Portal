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
  /** On desktop (lg+), when false the sidebar is collapsed (hidden). Default true. */
  isOpen?: boolean
}

export default function Sidebar({ items, isOpen = true }: SidebarProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { t } = useTranslation(['err', 'common'])

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
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="p-6 border-b">
            <SheetTitle>{t('err:navigation')}</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-2 p-4 h-[calc(100%-80px)] justify-between">
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                    pathname === item.href && 'bg-muted text-foreground'
                  )}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground mt-auto"
            >
              <LogOut className="h-5 w-5" />
              <span>{t('common:logout')}</span>
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar - full width when open, icon-only strip when closed */}
      <div
        className={cn(
          'hidden lg:flex h-screen flex-col border-r rtl:border-l bg-background transition-all duration-300 ease-in-out shrink-0',
          isOpen ? 'w-64' : 'w-16'
        )}
      >
        <div className={cn('border-b transition-all duration-300', isOpen ? 'p-6' : 'p-4')}>
          <h2 className={cn('text-lg font-semibold transition-all duration-300', !isOpen && 'opacity-0 w-0 overflow-hidden')}>
            {t('err:navigation')}
          </h2>
        </div>
        <nav className="flex flex-col gap-2 p-4 h-[calc(100%-80px)] justify-between">
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center rounded-lg py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  isOpen ? 'gap-3 px-3' : 'justify-center mx-0.5 w-9 h-9',
                  pathname === item.href && 'bg-muted text-foreground'
                )}
                title={!isOpen ? item.label : undefined}
              >
                <span className="text-xl flex items-center justify-center w-6 h-6">{item.icon}</span>
                <span className={cn('transition-all duration-300', !isOpen && 'w-0 overflow-hidden opacity-0')}>
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
          <button
            onClick={handleLogout}
            className={cn(
              'flex items-center rounded-lg py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground mt-auto',
              isOpen ? 'gap-3 px-3' : 'justify-center mx-0.5 w-9 h-9'
            )}
            title={!isOpen ? t('common:logout') : undefined}
          >
            <LogOut className="h-5 w-5" />
            <span className={cn('transition-all duration-300', !isOpen && 'w-0 overflow-hidden opacity-0')}>
              {t('common:logout')}
            </span>
          </button>
        </nav>
      </div>
    </>
  )
} 