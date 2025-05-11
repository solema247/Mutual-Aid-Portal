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
import { Menu } from 'lucide-react'

interface SidebarProps {
  items: {
    href: string
    label: string
    icon: string
  }[]
}

export default function Sidebar({ items }: SidebarProps) {
  const [open, setOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const pathname = usePathname()
  const { t } = useTranslation(['err'])

  return (
    <>
      {/* Mobile sidebar */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="p-6 border-b">
            <SheetTitle>{t('err:navigation')}</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-2 p-4">
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
          </nav>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div
        className={cn(
          'hidden lg:flex h-screen flex-col border-r bg-background transition-all duration-300 ease-in-out',
          isExpanded ? 'w-64' : 'w-16'
        )}
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
      >
        <div className={cn(
          'p-6 border-b transition-all duration-300',
          !isExpanded && 'p-4'
        )}>
          <h2 className={cn(
            'text-lg font-semibold transition-all duration-300',
            !isExpanded && 'opacity-0'
          )}>
            {t('err:navigation')}
          </h2>
        </div>
        <nav className="flex flex-col gap-2 p-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg transition-all duration-300',
                !isExpanded ? 'justify-center px-2 py-2' : 'px-3 py-2',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
                pathname === item.href && 'bg-muted text-foreground'
              )}
            >
              <span className="text-xl">{item.icon}</span>
              <span className={cn(
                'transition-all duration-300',
                !isExpanded && 'w-0 overflow-hidden opacity-0'
              )}>
                {item.label}
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
} 