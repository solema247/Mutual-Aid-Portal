'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const { t } = useTranslation(['login', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ERR login state
  const [errId, setErrId] = useState('')
  const [pin, setPin] = useState('')

  // Partner login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    const handleMagicLinkAuth = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (session && !error) {
        // If we have a session after magic link auth, redirect to change password
        window.location.href = '/change-password'
        return
      }
    }
    
    // Check if we're coming from a magic link
    const hash = window.location.hash
    if (hash) {
      handleMagicLinkAuth()
    }
  }, [])

  const handleErrLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('err_id', errId)
        .single()

      if (!user || user.pin_hash !== pin) {
        setError('Invalid ERR ID or PIN')
        return
      }

      // Store in localStorage
      localStorage.setItem('user', JSON.stringify(user))
      localStorage.setItem('isAuthenticated', 'true')
      
      // Set cookies
      document.cookie = `isAuthenticated=true; path=/`
      document.cookie = `userType=err; path=/`

      // Redirect to ERR dashboard instead of root
      window.location.href = '/err-portal'
    } catch (err) {
      console.error('Login error:', err)
      setError('Failed to login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePartnerLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      console.log('Starting login...')
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      console.log('Auth result:', { authData, authError })

      if (authError) {
        setError('Authentication failed')
        return
      }

      console.log('User metadata:', authData.user?.user_metadata)

      if (!authData.user?.user_metadata?.has_changed_password) {
        console.log('Redirecting to change password...')
        window.location.href = '/change-password'
        return
      }

      // Check donor_users relationship
      const { data: donor, error: donorError } = await supabase
        .from('donor_users')
        .select('*, donors(name)')
        .eq('id', authData.user?.id)
        .single()

      console.log('Donor check:', { donor, donorError })

      if (donorError || !donor) {
        setError('User not found or not authorized')
        return
      }

      // Set authentication state
      localStorage.setItem('donor', JSON.stringify(donor))
      localStorage.setItem('isAuthenticated', 'true')
      document.cookie = `isAuthenticated=true; path=/`
      document.cookie = `userType=partner; path=/`

      console.log('Redirecting to forecast...')
      await new Promise(resolve => setTimeout(resolve, 1000)) // Delay to see logs
      window.location.href = '/partner-portal'

    } catch (err) {
      console.error('Login error:', err)
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
                  <Label htmlFor="errId">{t('login:err_id')}</Label>
                  <Input
                    id="errId"
                    value={errId}
                    onChange={(e) => setErrId(e.target.value)}
                    className="rounded-full"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">{t('login:pin')}</Label>
                  <Input
                    id="pin"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
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