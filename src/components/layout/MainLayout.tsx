'use client'

import { ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Sidebar, { type SidebarItem } from './Sidebar'
import LanguageSwitch from '@/components/LanguageSwitch'
import { Button } from '@/components/ui/button'
import { Globe, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPortalRoleLabel } from '@/lib/roleLabels'

interface MainLayoutProps {
  children: ReactNode
  sidebarItems: SidebarItem[]
  /** Optional sidebar header title (e.g. for partner portal). When not set, uses err:navigation. */
  sidebarTitle?: string
  /** Optional user display name shown in the header. */
  userName?: string
  /** Optional user role for display (e.g. "superadmin" -> "Super Admin"). When set with headerTitle, shown in header. */
  userRole?: string
  /** When set, shows the sticky header bar with title, sidebar toggle, language, and user. */
  headerTitle?: string
  /** Extra controls before the language switcher (e.g. page explainer). */
  headerExtra?: ReactNode
}

function formatRole(role: string | undefined, t: (key: string, opts?: Record<string, string>) => string): string {
  if (!role) return ''
  return getPortalRoleLabel(role, t)
}

export default function MainLayout({ children, sidebarItems, sidebarTitle, userName, userRole, headerTitle, headerExtra }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  const { t, i18n } = useTranslation(['users', 'common', 'err'])
  const showHeader = !!headerTitle
  const isControlledSidebar = showHeader

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en'
    i18n.changeLanguage(newLang)
    if (typeof document !== 'undefined') document.dir = newLang === 'ar' ? 'rtl' : 'ltr'
  }

  const userDisplay = (userName ?? (userRole ? formatRole(userRole, t) : '')) || null

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <Sidebar
        items={sidebarItems}
        title={sidebarTitle}
        isOpen={isControlledSidebar ? sidebarOpen : undefined}
        mobileSheetOpen={showHeader ? mobileSheetOpen : undefined}
        onMobileSheetOpenChange={showHeader ? setMobileSheetOpen : undefined}
      />
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {showHeader && (
          <nav className="z-40 shrink-0 w-full text-white backdrop-blur bg-gradient-to-r from-brand-header to-brand-purple">
            <div className="mx-auto flex h-14 max-w-full items-center justify-between px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden flex size-9 shrink-0 rounded-md bg-brand-header text-white hover:bg-brand-header/90 hover:brightness-110 border-0 shadow-none"
                  aria-label="Open menu"
                  onClick={() => setMobileSheetOpen(true)}
                >
                  <Menu className="h-5 w-5" strokeWidth={2} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden lg:flex size-9 shrink-0 rounded-md text-white hover:text-white/90 border-0 shadow-none bg-transparent hover:bg-white/10"
                  aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                >
                  <Menu className="h-5 w-5" strokeWidth={2} />
                </Button>
                <div className="truncate text-lg font-semibold text-white">{headerTitle}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {headerExtra}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 px-3 py-1.5 font-medium text-white hover:text-brand-orange hover:bg-white/10"
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
        <main className="min-h-0 w-full min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <div className={cn(
            'container mx-auto max-w-full px-4 pb-4 sm:px-6',
            showHeader ? 'pt-4' : 'pt-20 lg:pt-6'
          )}>
            {!showHeader && (
              <div className="mb-4 flex items-center justify-end gap-4">
                {userName && (
                  <span className="text-sm text-muted-foreground">{userName}</span>
                )}
                <LanguageSwitch />
              </div>
            )}
            <div className="h-auto w-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
} 