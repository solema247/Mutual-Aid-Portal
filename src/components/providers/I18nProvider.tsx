'use client'

import { useEffect, useState } from 'react'
import i18next from 'i18next'
import { I18nextProvider } from 'react-i18next'
import '@/i18n/config'

export default function I18nProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [instance, setInstance] = useState(i18next)

  useEffect(() => {
    // Initialize i18next on the client side
    setInstance(i18next)

    // Set HTML dir attribute based on language
    const handleLanguageChange = () => {
      document.documentElement.dir = i18next.language === 'ar' ? 'rtl' : 'ltr'
    }

    i18next.on('languageChanged', handleLanguageChange)
    handleLanguageChange() // Set initial direction

    return () => {
      i18next.off('languageChanged', handleLanguageChange)
    }
  }, [])

  return (
    <I18nextProvider i18n={instance}>
      {children}
    </I18nextProvider>
  )
} 