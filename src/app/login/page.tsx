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
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabaseClient'
import Image from 'next/image'
import LanguageSwitch from '@/components/LanguageSwitch'
import '@/i18n/config'

export default function LoginPage() {
  const { t } = useTranslation(['login', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ERR login state
  const [errEmail, setErrEmail] = useState('')
  const [errPassword, setErrPassword] = useState('')

  // Partner login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    const handleMagicLinkAuth = async () => {
      const hash = window.location.hash
      if (!hash) return
      
      // Parse hash parameters
      const hashParams = new URLSearchParams(hash.substring(1))
      const type = hashParams.get('type')
      const accessToken = hashParams.get('access_token')
      
      // If it's a recovery type, manually set the session from hash tokens
      if (type === 'recovery' && accessToken) {
        console.log('Recovery flow detected, manually setting session...')
        
        // Extract all tokens from hash
        const refreshToken = hashParams.get('refresh_token')
        
        if (!refreshToken) {
          console.error('No refresh token found in hash')
          return
        }
        
        // Manually set the session using the tokens from hash
        const { data: { session }, error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        
        if (setSessionError) {
          console.error('Error setting session:', setSessionError)
          return
        }
        
        if (session) {
          console.log('Session set successfully, redirecting to change-password')
          // Clean up the hash from URL
          window.history.replaceState(null, '', window.location.pathname)
          // Redirect to change password page
          window.location.href = '/change-password'
          return
        } else {
          console.error('setSession returned no session')
        }
      }
      
      // Handle other magic link types
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (session && !error) {
        // If we have a session after magic link auth, redirect to change password
        window.location.href = '/change-password'
      }
    }
    
    handleMagicLinkAuth()
  }, [])

  const handleErrLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      // First authenticate with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: errEmail,
        password: errPassword
      })

      if (authError) {
        setError('Authentication failed')
        return
      }

      // Check if user needs to change password
      const needsPasswordChange = authData.user?.user_metadata?.is_temporary_password === true ||
        authData.user?.user_metadata?.has_changed_password === false

      if (needsPasswordChange) {
        window.location.href = '/change-password'
        return
      }

      // Get the user's own record first
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .single()

      if (userError) {
        console.error('User data error:', userError)
        setError('Failed to fetch user data')
        return
      }

      if (!userData) {
        setError('User not found')
        return
      }

      if (userData.status !== 'active') {
        setError('Account is not active')
        return
      }

      // Store user data in localStorage
      localStorage.setItem('user', JSON.stringify(userData))
      localStorage.setItem('isAuthenticated', 'true')
      
      // Set cookies
      document.cookie = `isAuthenticated=true; path=/`
      document.cookie = `userType=err; path=/`

      // Redirect to ERR portal
      window.location.href = '/err-portal'
    } catch (err) {
      console.error('Login error:', err)
      setError(err instanceof Error ? err.message : 'Failed to login')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePartnerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (authError) {
        setError('Authentication failed')
        return
      }

      if (!authData.user?.user_metadata?.has_changed_password) {
        window.location.href = '/change-password'
        return
      }

      // Check donor_users relationship
      const { data: donor, error: donorError } = await supabase
        .from('donor_users')
        .select('*, donors(name)')
        .eq('id', authData.user?.id)
        .single()

      if (donorError || !donor) {
        setError('User not found or not authorized')
        return
      }

      // Set authentication state
      localStorage.setItem('donor', JSON.stringify(donor))
      localStorage.setItem('isAuthenticated', 'true')
      document.cookie = `isAuthenticated=true; path=/`
      document.cookie = `userType=partner; path=/`

      await new Promise(resolve => setTimeout(resolve, 1000)) // Delay to see logs
      window.location.href = '/partner-portal'

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <LanguageSwitch />
      <div className="text-center mb-8">
        <Image
          src="/logo.jpg"
          alt="LCC Sudan Logo"
          width={300}
          height={350}
          priority
          className="mx-auto mb-6"
        />
        <h1 className="text-2xl font-bold mb-4">{t('login:title')}</h1>
        <Button
          variant="outline"
          className="mb-8 border-2 rounded-full"
          onClick={() => window.open('https://lccsudan.org/', '_blank')}
        >
          {t('login:visit_lcc')}
        </Button>
      </div>

      <Card className="w-full max-w-md border-2 rounded-3xl">
        <CardHeader>
          <h2 className="text-xl font-bold">{t('login:login_title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('login:access_text')}
          </p>
        </CardHeader>

        <Tabs defaultValue="err" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="err" className="rounded-full">
              {t('login:err_staff')}
            </TabsTrigger>
            <TabsTrigger value="donor" className="rounded-full">
              {t('login:partner')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="err">
            <form onSubmit={handleErrLogin}>
              <CardContent className="space-y-4 px-6">
                {error && (
                  <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="errEmail">{t('login:email')}</Label>
                  <Input
                    id="errEmail"
                    type="email"
                    value={errEmail}
                    onChange={(e) => setErrEmail(e.target.value)}
                    className="rounded-full"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="errPassword">{t('login:password')}</Label>
                  <Input
                    id="errPassword"
                    type="password"
                    value={errPassword}
                    onChange={(e) => setErrPassword(e.target.value)}
                    className="rounded-full"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full rounded-full mt-4"
                  disabled={isLoading}
                >
                  {isLoading ? t('login:signing_in') : t('login:sign_in')}
                </Button>
              </CardContent>
            </form>
          </TabsContent>

          <TabsContent value="donor">
            <form onSubmit={handlePartnerLogin}>
              <CardContent className="space-y-4 px-6">
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
                    className="rounded-full"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t('login:password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-full"
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full rounded-full mt-4"
                  disabled={isLoading}
                >
                  {isLoading ? t('login:signing_in') : t('login:sign_in')}
                </Button>
              </CardContent>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
} 