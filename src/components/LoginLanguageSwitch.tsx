'use client'

import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

const LANGUAGES = [
  { value: 'en', label: 'English (US)', flagCode: 'us' },
  { value: 'ar', label: 'العربية', flagCode: 'sd' },
] as const

export default function LoginLanguageSwitch({
  className,
}: {
  className?: string
}) {
  const { i18n } = useTranslation()
  const current = i18n.language?.startsWith('ar') ? 'ar' : 'en'
  const currentOption = LANGUAGES.find((l) => l.value === current) ?? LANGUAGES[0]

  const handleChange = (value: string) => {
    const newLang = value as 'en' | 'ar'
    i18n.changeLanguage(newLang)
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger
        className={cn(
          'flex items-center gap-2 border-0 bg-transparent shadow-none text-gray-700 hover:bg-transparent hover:opacity-80 h-9 px-2 min-w-[140px] [&_svg]:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0',
          className
        )}
      >
        <span
          className={cn('fi fi-' + currentOption.flagCode, 'shrink-0 rounded-sm overflow-hidden text-[18px]')}
          aria-hidden
        />
        <SelectValue>{currentOption.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            <span
              className={cn('fi fi-' + opt.flagCode, 'mr-2 inline-block rounded-sm overflow-hidden text-[16px]')}
              aria-hidden
            />
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
