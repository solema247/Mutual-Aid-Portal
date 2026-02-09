'use client'

import I18nProvider from './I18nProvider'

export default function Providers({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <I18nProvider>
      {children}
    </I18nProvider>
  )
} 