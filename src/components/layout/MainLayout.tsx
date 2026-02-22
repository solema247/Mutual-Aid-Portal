'use client'

import { ReactNode, ReactElement, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import LanguageSwitch from '@/components/LanguageSwitch'
import { Button } from '@/components/ui/button'
import { PanelLeftClose, PanelLeftOpen, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MainLayoutProps {
  children: ReactNode
  sidebarItems: {
    href: string
    label: string
    icon: string | ReactElement
  }[]
  /** Optional sidebar header title (e.g. for partner portal). When not set, uses err:navigation. */
  sidebarTitle?: string
  /** Optional user display name shown in the header. */
  userName?: string
  /** Optional user role for display (e.g. "superadmin" -> "Super Admin"). When set with headerTitle, shown in header. */
  userRole?: string
  /** When set, shows the sticky header bar with title, sidebar toggle, language, and user. */
  headerTitle?: string
}

function formatRole(role: string | undefined): string {
  if (!role) return ''
  const map: Record<string, string> = {
    superadmin: 'Super Admin',
    admin: 'Admin',
    state_err: 'State ERR',
    base_err: 'Base ERR',
  }
  return map[role.toLowerCase()] ?? role
}

export default function MainLayout({ children, sidebarItems, sidebarTitle, userName, userRole, headerTitle }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { i18n } = useTranslation()
  const showHeader = !!headerTitle
  const isControlledSidebar = showHeader

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en'
    i18n.changeLanguage(newLang)
    if (typeof document !== 'undefined') document.dir = newLang === 'ar' ? 'rtl' : 'ltr'
  }

  const userDisplay = (() => {
    if (!userName && !userRole) return null
    const role = formatRole(userRole)
    if (role && userName) return `${role} ${userName}`
    return userName ?? role ?? ''
  })()

  return (
    <div className="min-h-screen overflow-x-hidden">
      {showHeader && (
        <nav className="sticky top-0 z-40 w-full text-white backdrop-blur bg-gradient-to-r from-slate-800 to-slate-700">
          <div className="mx-auto flex h-14 max-w-full items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex size-9 shrink-0 text-white hover:text-white hover:bg-white/10"
                aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
              </Button>
              <div className="truncate text-lg font-semibold text-white">{headerTitle}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-3 py-1.5 font-medium text-white hover:bg-white/10"
                aria-label={i18n.language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
                onClick={toggleLanguage}
              >
                <Globe className="h-4 w-4" />
                {i18n.language === 'en' ? 'العربية' : 'English'}
              </Button>
              {userDisplay && (
                <span
                  className="max-w-[140px] truncate rounded-md bg-white/15 px-3 py-1.5 text-sm font-medium text-white sm:max-w-[200px]"
                  title={userDisplay}
                >
                  {userDisplay}
                </span>
              )}
            </div>
          </div>
        </nav>
      )}
      <div className="flex">
        <Sidebar
          items={sidebarItems}
          title={sidebarTitle}
          isOpen={isControlledSidebar ? sidebarOpen : undefined}
        />
        <main className="flex-1 transition-all duration-300 min-w-0 w-full">
          <div className={cn(
            'container mx-auto px-4 sm:px-6 py-6 max-w-full',
            showHeader ? 'pt-4' : 'pt-20 lg:pt-6'
          )}>
            {!showHeader && (
              <div className="flex justify-end items-center gap-4 mb-6">
                {userName && (
                  <span className="text-sm text-muted-foreground">{userName}</span>
                )}
                <LanguageSwitch />
              </div>
            )}
            <div className="w-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
} 