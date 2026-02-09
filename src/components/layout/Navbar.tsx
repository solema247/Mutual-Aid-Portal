'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Globe, PanelLeft, PanelLeftClose } from 'lucide-react'

interface NavbarProps {
  /** Optional title or logo area on the left */
  title?: React.ReactNode
  /** Optional username override (e.g. from layout API); otherwise read from localStorage */
  userName?: string | null
  /** Optional class name for the nav element */
  className?: string
  /** Sidebar open state (for layouts with sidebar); when set, shows toggle button on large screens */
  sidebarOpen?: boolean
  /** Called when user clicks sidebar toggle (large screens only) */
  onSidebarToggle?: () => void
}

export default function Navbar({ title, userName: userNameProp, className = '', sidebarOpen, onSidebarToggle }: NavbarProps) {
  const { i18n, t } = useTranslation(['common'])
  const [userName, setUserName] = useState<string | null>(userNameProp ?? null)

  // Sync with prop or resolve from localStorage
  useEffect(() => {
    if (userNameProp !== undefined) {
      setUserName(userNameProp)
      return
    }
    const donor = typeof window !== 'undefined' ? window.localStorage.getItem('donor') : null
    const user = typeof window !== 'undefined' ? window.localStorage.getItem('user') : null
    if (donor) {
      try {
        const data = JSON.parse(donor)
        setUserName(data?.donors?.name || 'User')
      } catch {
        setUserName('User')
      }
    } else if (user) {
      try {
        const data = JSON.parse(user)
        setUserName(data?.full_name || 'User')
      } catch {
        setUserName('User')
      }
    } else {
      setUserName(null)
    }
  }, [userNameProp])

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en'
    i18n.changeLanguage(newLang)
    if (typeof document !== 'undefined') {
      document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
    }
  }

  const displayName = userName || t('common:guest') || 'Guest'

  return (
    <nav
      className={`sticky top-0 z-40 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 ${className}`}
    >
      <div className="mx-auto flex h-14 max-w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {onSidebarToggle != null && (
            <Button
              variant="outline"
              size="icon"
              className="hidden shrink-0 lg:flex"
              onClick={onSidebarToggle}
              aria-label={sidebarOpen ? (t('common:sidebar_hide') || 'Hide sidebar') : (t('common:sidebar_show') || 'Show sidebar')}
            >
              {sidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
            </Button>
          )}
          {title != null ? (
            <div className="truncate text-lg font-semibold text-gray-900">
              {title}
            </div>
          ) : (
            <div className="truncate text-lg font-semibold text-gray-900">
              Mutual Aid Portal
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            onClick={toggleLanguage}
            variant="outline"
            size="sm"
            className="gap-1.5 border-2 px-3 py-1.5 font-medium hover:bg-accent"
            aria-label={i18n.language === 'en' ? 'Switch to Arabic' : 'Switch to English'}
          >
            <Globe className="h-4 w-4" />
            {i18n.language === 'en' ? 'العربية' : 'English'}
          </Button>
          <span
            className="max-w-[140px] truncate rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 sm:max-w-[200px]"
            title={displayName}
          >
            {displayName}
          </span>
        </div>
      </div>
    </nav>
  )
}
