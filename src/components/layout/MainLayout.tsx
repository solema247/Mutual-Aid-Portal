'use client'

import { useState, ReactNode, ReactElement } from 'react'
import { cn } from '@/lib/utils'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

interface MainLayoutProps {
  children: ReactNode
  sidebarItems: {
    href: string
    label: string
    icon: string | ReactElement
  }[]
  /** Optional username to show in navbar (e.g. from layout user) */
  userName?: string | null
}

export default function MainLayout({ children, sidebarItems, userName }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      <Sidebar items={sidebarItems} isOpen={sidebarOpen} />
      {/* Spacer so main content is not hidden under the fixed sidebar */}
      <div
        className={cn(
          'hidden shrink-0 transition-[width] duration-300 lg:block',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
        aria-hidden
      />
      <main className="flex-1 min-w-0 min-h-screen w-0">
          <Navbar
            userName={userName}
            sidebarOpen={sidebarOpen}
            onSidebarToggle={() => setSidebarOpen((v) => !v)}
          />
          <div className="container mx-auto px-4 sm:px-6 py-6 max-w-full">
            <div className="w-full">
              {children}
            </div>
          </div>
      </main>
    </div>
  )
} 