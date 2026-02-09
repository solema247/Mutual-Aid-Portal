'use client'

import { useState, ReactNode, ReactElement } from 'react'
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
    <div className="min-h-screen overflow-x-hidden">
      <div className="flex">
        <Sidebar items={sidebarItems} isOpen={sidebarOpen} />
        <main className="flex-1 transition-all duration-300 min-w-0 w-full">
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
    </div>
  )
} 