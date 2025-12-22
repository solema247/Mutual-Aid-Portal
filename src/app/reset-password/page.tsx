'use client'

import { useState, useEffect } from 'react'
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

export default function ResetPasswordPage() {
  const { t } = useTranslation(['login', 'common'])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidSession, setIsValidSession] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check if we have a valid session (from password reset link)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          // Check if we're coming from a password reset link in the URL hash
          const hash = window.location.hash
          if (hash) {
            const hashParams = new URLSearchParams(hash.substring(1))
            const accessToken = hashParams.get('access_token')
            const refreshToken = hashParams.get('refresh_token')
            const type = hashParams.get('type')

            if (accessToken && refreshToken && type === 'recovery') {
              // Set session from recovery token
              const { data: { session: newSession }, error: setError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })

              if (setError || !newSession) {
                setError(t('login:invalid_reset_link'))
                setIsChecking(false)
                return
              }

              setIsValidSession(true)
              // Clean up the hash from URL
              window.history.replaceState(null, '', window.location.pathname)
            } else {
              setError(t('login:invalid_reset_link'))
            }
          } else {
            setError(t('login:invalid_reset_link'))
          }
        } else {
          setIsValidSession(true)
        }
      } catch (err) {
        console.error('Session check error:', err)
        setError(t('login:invalid_reset_link'))
      } finally {
        setIsChecking(false)
      }
    }

    checkSession()
  }, [t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (password !== confirmPassword) {
        throw new Error(t('login:passwords_not_match'))
      }

      if (password.length < 6) {
        throw new Error(t('login:password_too_short'))
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: { 
          has_changed_password: true,
          is_temporary_password: false
        }
      })

      if (updateError) throw updateError

      // Success - redirect to login
      window.location.href = '/login?password_reset=success'
    } catch (err) {
      console.error('Password reset error:', err)
      setError(err instanceof Error ? err.message : t('login:reset_failed'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">{t('common:loading')}</div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isValidSession && error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <LanguageSwitch />
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('login:reset_password_title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('login:invalid_link_instructions')}
            </p>
            <div className="flex gap-2">
              <Link href="/forgot-password" className="flex-1">
                <Button variant="outline" className="w-full">
                  {t('login:request_new_link')}
                </Button>
              </Link>
              <Link href="/login" className="flex-1">
                <Button className="w-full">
                  {t('login:back_to_login')}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <LanguageSwitch />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('login:reset_password_title')}</CardTitle>
          <CardDescription>
            {t('login:reset_password_description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">{t('login:new_password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-full"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('login:confirm_password')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-full"
                required
                minLength={6}
              />
            </div>
            <Button 
              type="submit" 
              className="w-full rounded-full"
              disabled={isLoading}
            >
              {isLoading ? t('login:updating') : t('login:update_password')}
            </Button>
            <div className="text-center">
              <Link href="/login" className="text-sm text-muted-foreground hover:underline">
                {t('login:back_to_login')}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

