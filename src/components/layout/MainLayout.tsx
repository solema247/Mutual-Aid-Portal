'use client'

import { ReactNode, ReactElement } from 'react'
import Sidebar from './Sidebar'
import LanguageSwitch from '@/components/LanguageSwitch'

interface MainLayoutProps {
  children: ReactNode
  sidebarItems: {
    href: string
    label: string
    icon: string | ReactElement
  }[]
  /** Optional sidebar header title (e.g. for partner portal). When not set, uses err:navigation. */
  sidebarTitle?: string
}

export default function MainLayout({ children, sidebarItems, sidebarTitle }: MainLayoutProps) {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <div className="flex">
        <Sidebar items={sidebarItems} title={sidebarTitle} />
        <main className="flex-1 transition-all duration-300 min-w-0 w-full">
          <div className="container mx-auto px-4 sm:px-6 py-6 max-w-full pt-20 lg:pt-6">
            <div className="flex justify-end mb-6">
              <LanguageSwitch />
            </div>
            <div className="w-full">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
} 