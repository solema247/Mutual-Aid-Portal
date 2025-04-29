'use client'

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export default function LanguageSwitch() {
  const { i18n } = useTranslation()

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar' : 'en'
    i18n.changeLanguage(newLang)
    document.dir = newLang === 'ar' ? 'rtl' : 'ltr'
  }

  return (
    <div className="w-full flex justify-end mb-6">
      <Button
        onClick={toggleLanguage}
        variant="outline"
        size="lg"
        className="text-lg font-medium border-2 px-6 py-2 rounded-full hover:bg-accent"
      >
        {i18n.language === 'en' ? 'العربية' : 'English'}
      </Button>
    </div>
  )
} 