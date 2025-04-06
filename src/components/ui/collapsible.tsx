"use client"

import * as React from "react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const Collapsible = CollapsiblePrimitive.Root
const CollapsibleTrigger = CollapsiblePrimitive.Trigger
const CollapsibleContent = CollapsiblePrimitive.Content

function CollapsibleRow({
  title,
  children,
  className,
  variant = 'default'
}: {
  title: string
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'primary'
}) {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger 
        className={cn(
          "flex w-full items-center justify-between rounded-md border px-4 py-2 font-medium",
          variant === 'primary' 
            ? 'bg-[#007229]/10 border-[#007229]/20 text-[#007229] hover:bg-[#007229]/20' 
            : 'bg-muted/50 hover:bg-muted',
          className
        )}
      >
        <span>{title}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", {
            "transform rotate-180": isOpen,
          })}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent, CollapsibleRow } 