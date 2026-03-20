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
import { Languages } from 'lucide-react'

const LANGUAGES = [
  { value: 'en', label: 'English', neutral: true },
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

  const renderIcon = (opt: (typeof LANGUAGES)[number], sizeClass = 'text-[18px]') =>
    'neutral' in opt && opt.neutral ? (
      <Languages className={cn('shrink-0 text-gray-500', sizeClass)} aria-hidden />
    ) : (
      <span
        className={cn('fi fi-' + ('flagCode' in opt ? opt.flagCode : 'sd'), 'shrink-0 rounded-sm overflow-hidden', sizeClass)}
        aria-hidden
      />
    )

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger
        className={cn(
          'flex items-center gap-2 border-0 bg-transparent shadow-none text-gray-700 hover:bg-transparent hover:opacity-80 h-9 px-2 min-w-[140px] [&_svg]:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0',
          className
        )}
      >
        {renderIcon(currentOption)}
        <SelectValue>{currentOption.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LANGUAGES.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {renderIcon(opt, 'text-[16px] mr-2')}
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
