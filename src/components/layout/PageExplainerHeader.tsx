'use client'

import { HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePageExplainerContext } from '@/contexts/PageExplainerContext'
import { cn } from '@/lib/utils'

/**
 * Header help control: question-mark icon with tooltip; opens the current page explainer dialog.
 */
export default function PageExplainerHeader() {
  const { config, open, setOpen, openModal } = usePageExplainerContext()

  if (!config) return null

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-md text-white hover:text-brand-orange hover:bg-white/10 border-0 shadow-none"
        title={config.tooltip}
        aria-label={config.tooltip}
        onClick={() => openModal()}
      >
        <HelpCircle className="h-5 w-5" strokeWidth={2} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'max-h-[85vh] w-[calc(100vw-2rem)] max-w-2xl overflow-hidden p-0 gap-0',
            'border-2 border-brand-light-blue/50 bg-brand-bg shadow-xl',
            '[&>button]:absolute [&>button]:right-4 [&>button]:top-4 [&>button]:z-10',
            '[&>button]:text-white [&>button]:opacity-90 [&>button]:hover:opacity-100',
            '[&>button]:hover:bg-white/15 [&>button]:data-[state=open]:bg-transparent',
            '[&>button]:data-[state=open]:text-white [&>button]:ring-offset-brand-header',
            '[&>button]:focus:ring-white/40 [&>button]:focus:ring-offset-2'
          )}
        >
          <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-[inherit]">
            <div className="shrink-0 bg-gradient-to-r from-brand-header to-brand-purple px-6 py-4 pr-14 text-white shadow-sm">
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="text-lg font-semibold leading-snug text-white">
                  {config.title}
                </DialogTitle>
              </DialogHeader>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm text-brand-body">
              {config.content}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
