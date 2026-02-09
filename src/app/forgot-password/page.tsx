'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import LanguageSwitch from '@/components/LanguageSwitch'
import '@/i18n/config'

export default function ForgotPasswordPage() {
  const { t } = useTranslation(['login', 'common'])
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      // Send password reset email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        throw resetError
      }

      setSuccess(true)
    } catch (err) {
      console.error('Password reset error:', err)
      setError(err instanceof Error ? err.message : t('login:reset_error'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <LanguageSwitch />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('login:forgot_password_title')}</CardTitle>
          <CardDescription>
            {t('login:forgot_password_description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm p-4 rounded-md">
                {t('login:reset_email_sent')}
              </div>
              <p className="text-sm text-muted-foreground">
                {t('login:check_email_instructions')}
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  {t('login:back_to_login')}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t('login:email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login:email_placeholder')}
                  className="rounded-full"
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full rounded-full"
                disabled={isLoading}
              >
                {isLoading ? t('login:sending') : t('login:send_reset_link')}
              </Button>
              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                  {t('login:back_to_login')}
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

