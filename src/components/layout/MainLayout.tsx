'use client'

import { ReactNode } from 'react'
import Sidebar from './Sidebar'
import LanguageSwitch from '@/components/LanguageSwitch'

interface MainLayoutProps {
  children: ReactNode
  sidebarItems: {
    href: string
    label: string
    icon: string
  }[]
}

export default function MainLayout({ children, sidebarItems }: MainLayoutProps) {
  return (
    <div className="min-h-screen">
      <div className="flex">
        <Sidebar items={sidebarItems} />
        <main className="flex-1 transition-all duration-300">
          <div className="container p-6">
            <div className="flex justify-end mb-6">
              <LanguageSwitch />
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
} 