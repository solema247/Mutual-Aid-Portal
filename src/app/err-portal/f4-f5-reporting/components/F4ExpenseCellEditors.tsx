'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { formatAmountDisplay, parseAmountInput } from '@/lib/f4ExpenseUi'

const selectableInputStyle: CSSProperties = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
}

/** Count digit/decimal characters before caret (ignores commas/spaces). */
function significantCharsBefore (value: string, caret: number): number {
  let n = 0
  const end = Math.min(caret, value.length)
  for (let i = 0; i < end; i++) {
    const ch = value[i]
    if ((ch >= '0' && ch <= '9') || ch === '.' || ch === '-') n++
  }
  return n
}

function caretFromSignificant (formatted: string, significantCount: number): number {
  if (significantCount <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    const ch = formatted[i]
    if ((ch >= '0' && ch <= '9') || ch === '.' || ch === '-') {
      seen++
      if (seen >= significantCount) return i + 1
    }
  }
  return formatted.length
}

/**
 * Live-format amount string with thousand separators while typing.
 * Preserves trailing "." so decimals can still be entered.
 */
export function formatAmountWhileTyping (raw: string, locale: string): string {
  const cleaned = String(raw || '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^\d.-]/g, '')

  if (!cleaned) return ''
  if (cleaned === '-' || cleaned === '.' || cleaned === '-.') return cleaned

  const neg = cleaned.startsWith('-')
  const body = neg ? cleaned.slice(1) : cleaned
  const endsWithDot = body.endsWith('.')
  const parts = body.split('.')
  const intRaw = parts[0] || '0'
  const fracRaw = parts.length > 1 ? parts.slice(1).join('').replace(/\D/g, '') : null

  const intNum = Number(intRaw.replace(/^0+(?=\d)/, '') || '0')
  if (!Number.isFinite(intNum)) return cleaned

  const intFormatted = intNum.toLocaleString(locale.startsWith('ar') ? 'en-US' : 'en-US', {
    maximumFractionDigits: 0,
  })

  let out = (neg ? '-' : '') + intFormatted
  if (fracRaw != null) {
    out += '.' + fracRaw.slice(0, 2)
  } else if (endsWithDot) {
    out += '.'
  }
  return out
}

/** Compact field that expands on focus for description / seller / receipt reference. */
export function F4ExpandableTextInput ({
  value,
  onChange,
  placeholder,
  disabled,
  multiline = true,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
  multiline?: boolean
}) {
  const [focused, setFocused] = useState(false)

  if (multiline) {
    return (
      <div className={cn('relative w-full', focused && 'z-20')}>
        <Textarea
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          rows={focused ? 4 : 1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full resize-none text-sm transition-[min-height,box-shadow] duration-150',
            'select-text selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100',
            focused
              ? 'min-h-[6rem] shadow-md ring-2 ring-ring'
              : 'min-h-8 h-8 overflow-hidden py-1.5 leading-5'
          )}
          style={selectableInputStyle}
        />
      </div>
    )
  }

  return (
    <Input
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-8 select-text transition-shadow',
        focused && 'ring-2 ring-ring shadow-sm'
      )}
      style={selectableInputStyle}
    />
  )
}

/** Amount input with live thousand separators while typing. */
export function F4FormattedAmountInput ({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: {
  value: number | null | undefined
  onChange: (next: number | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const { i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(() => formatAmountDisplay(value, locale))
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!focused) {
      setText(formatAmountDisplay(value, locale))
    }
  }, [value, locale, focused])

  return (
    <Input
      ref={inputRef}
      disabled={disabled}
      className={cn(
        'h-8 select-text text-right tabular-nums selection:bg-blue-200 selection:text-blue-900 dark:selection:bg-blue-800 dark:selection:text-blue-100',
        className
      )}
      style={selectableInputStyle}
      inputMode="decimal"
      placeholder={placeholder}
      value={focused ? text : formatAmountDisplay(value, locale)}
      onFocus={() => {
        setFocused(true)
        setText(formatAmountDisplay(value, locale))
      }}
      onBlur={() => {
        setFocused(false)
        const parsed = parseAmountInput(text)
        onChange(parsed)
        setText(formatAmountDisplay(parsed, locale))
      }}
      onChange={(e) => {
        const el = e.target
        const raw = el.value
        const sigBefore = significantCharsBefore(raw, el.selectionStart ?? raw.length)
        const formatted = formatAmountWhileTyping(raw, locale)
        setText(formatted)
        const parsed = parseAmountInput(formatted)
        if (parsed != null || formatted.trim() === '' || formatted === '-' || formatted.endsWith('.')) {
          onChange(formatted.trim() === '' || formatted === '-' ? null : parsed)
        }
        requestAnimationFrame(() => {
          const node = inputRef.current
          if (!node) return
          const pos = caretFromSignificant(formatted, sigBefore)
          node.setSelectionRange(pos, pos)
        })
      }}
    />
  )
}
