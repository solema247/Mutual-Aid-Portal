'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabaseClient'
import Image from 'next/image'
import Link from 'next/link'
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

  // Clear stale/invalid Supabase sessions on login page load
  // This prevents automatic token refresh attempts with invalid tokens
  // while preserving valid concurrent sessions for the same account on other devices
  useEffect(() => {
    const clearStaleSession = async () => {
      // Skip if we're handling a magic link/recovery flow (needs the session)
      const hash = window.location.hash
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1))
        const accessToken = hashParams.get('access_token')
        if (accessToken) {
          // Don't clear if we're in the middle of a magic link/recovery flow
          return
        }
      }

      try {
        // Clear any existing local session to prevent automatic token refresh attempts
        // This only clears the local browser's session, not server-side sessions
        // Other users/devices with the same account will keep their sessions (concurrent sessions supported)
        // This prevents stale/invalid refresh tokens from causing rate limit errors
        await supabase.auth.signOut({ scope: 'local' })
      } catch (error) {
        // Ignore errors when clearing - we're just trying to prevent refresh attempts
        // If clearing fails, the worst case is we might hit rate limits, but we've tried
      }
    }

    clearStaleSession()
  }, [])

  useEffect(() => {
    const handleMagicLinkAuth = async () => {
      const hash = window.location.hash
      if (!hash) return
      
      // Parse hash parameters
      const hashParams = new URLSearchParams(hash.substring(1))
      const type = hashParams.get('type')
      const accessToken = hashParams.get('access_token')
      
      // Handle recovery type - redirect to reset-password page
      if (accessToken && type === 'recovery') {
        console.log('Recovery flow detected, redirecting to reset-password...')
        // Redirect to reset password page with hash
        window.location.href = `/reset-password${hash}`
        return
      }
      
      // Handle magic link types
      if (accessToken && (type === 'magiclink' || !type)) {
        console.log('Magic link flow detected, manually setting session...')
        
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
    }
    
    handleMagicLinkAuth()
  }, [])
  
  // Check for password reset success message
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('password_reset') === 'success') {
      // Show success message (you can add a toast notification here)
      console.log('Password reset successful')
    }
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
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="absolute top-6 right-6">
        <LanguageSwitch />
      </div>
      
      {/* Mobile Layout */}
      <div className="lg:hidden w-full h-screen flex flex-col p-4">
        <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
          {/* Tabs */}
          <Tabs defaultValue="err" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 h-auto bg-transparent border-b border-gray-200 rounded-none p-0 gap-2">
              <TabsTrigger 
                value="err" 
                className="rounded-lg whitespace-normal h-auto min-h-[36px] py-2 px-3 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-gray-100 data-[state=inactive]:text-gray-700 font-medium text-sm"
              >
                {t('login:err_staff') || 'ERR Login'}
              </TabsTrigger>
              <TabsTrigger 
                value="donor" 
                className="rounded-lg whitespace-normal h-auto min-h-[36px] py-2 px-3 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-gray-100 data-[state=inactive]:text-gray-700 font-medium text-xs leading-tight"
              >
                {t('login:partner_forecast_access') || 'Upload Forecasting'}
              </TabsTrigger>
            </TabsList>

            {/* ERR Tab */}
            <TabsContent value="err">
              <form onSubmit={handleErrLogin}>
                <div className="space-y-4">
                  {error && (
                    <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                      {error}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="errEmail" className="text-gray-700 font-medium text-sm">
                      {t('login:email') || 'Email'}
                    </Label>
                    <Input
                      id="errEmail"
                      type="email"
                      placeholder="example@email.com"
                      value={errEmail}
                      onChange={(e) => setErrEmail(e.target.value)}
                      className="rounded-lg border-gray-300 bg-white focus:bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="errPassword" className="text-gray-700 font-medium text-sm">
                        {t('login:password') || 'Password'}
                      </Label>
                      <Link 
                        href="/forgot-password" 
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {t('login:forgot_password') || 'Forgot Password'}??
                      </Link>
                    </div>
                    <Input
                      id="errPassword"
                      type="password"
                      placeholder="At least 8 characters"
                      value={errPassword}
                      onChange={(e) => setErrPassword(e.target.value)}
                      className="rounded-lg border-gray-300 bg-white focus:bg-white"
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full rounded-lg mt-4 bg-blue-900 hover:bg-blue-950 text-white font-medium py-2.5"
                    disabled={isLoading}
                  >
                    {isLoading ? t('login:signing_in') || 'Signing in...' : t('login:sign_in') || 'Sign in'}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* Donor Tab */}
            <TabsContent value="donor">
              <form onSubmit={handlePartnerLogin}>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4 pb-2 border-b border-gray-200">
                    {t('login:partner_forecast_note')}
                  </div>
                  {error && (
                    <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                      {error}
                    </div>
                  )}
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-700 font-medium text-sm">
                      {t('login:email') || 'Email'}
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="example@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-lg border-gray-300 bg-white focus:bg-white"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-gray-700 font-medium text-sm">
                        {t('login:password') || 'Password'}
                      </Label>
                      <Link 
                        href="/forgot-password" 
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {t('login:forgot_password') || 'Forgot Password'}??
                      </Link>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-lg border-gray-300 bg-white focus:bg-white"
                      required
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full rounded-lg mt-4 bg-blue-900 hover:bg-blue-950 text-white font-medium py-2.5"
                    disabled={isLoading}
                  >
                    {isLoading ? t('login:signing_in') || 'Signing in...' : t('login:sign_in') || 'Sign in'}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="flex items-center my-6 gap-4 w-full">
            <div className="flex-1 h-px bg-gray-300"></div>
            <span className="text-gray-500 text-sm font-medium">{t('common:or') || 'or'}</span>
            <div className="flex-1 h-px bg-gray-300"></div>
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-3 w-full">
            <Button 
              type="button"
              variant="outline"
              className="w-full rounded-lg border-gray-300 hover:bg-gray-50 py-2.5 font-medium text-gray-700 flex items-center justify-center gap-3"
              onClick={() => window.open('#', '_blank')}
            >
              <Image src="/google-icon.svg" alt="Google" width={20} height={20} />
              {t('login:sign_with_google') || 'sign_with_google'}
            </Button>
            <Button 
              type="button"
              variant="outline"
              className="w-full rounded-lg border-gray-300 hover:bg-gray-50 py-2.5 font-medium text-gray-700 flex items-center justify-center gap-3"
              onClick={() => window.open('#', '_blank')}
            >
              <Image src="/facebook-icon.svg" alt="Facebook" width={20} height={20} />
              {t('login:sign_with_facebook') || 'sign_with_facebook'}
            </Button>
          </div>

          {/* Sign Up Link */}
          <p className="text-center mt-6 text-sm text-gray-600 w-full">
            {t('login:no_account') || 'no_account'} {' '}
            <Link href="/signup" className="text-blue-600 hover:text-blue-800 font-bold">
              {t('login:sign_up') || 'sign_up'}
            </Link>
          </p>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex w-full h-screen items-center justify-center">
        {/* Left Column - Login Form */}
        <div className="w-1/2 h-full flex flex-col items-center justify-center px-16">
          <div className="w-full max-w-sm">
            {/* Tabs */}
            <Tabs defaultValue="err" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8 h-auto bg-transparent border-b border-gray-300 rounded-none p-0 gap-3">
                <TabsTrigger 
                  value="err" 
                  className="rounded-lg whitespace-normal h-auto min-h-[40px] py-2.5 px-6 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 font-medium text-base"
                >
                  {t('login:err_staff') || 'ERR Login'}
                </TabsTrigger>
                <TabsTrigger 
                  value="donor" 
                  className="rounded-lg whitespace-normal h-auto min-h-[40px] py-2.5 px-6 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 font-medium text-base"
                >
                  {t('login:partner_forecast_access') || 'Upload Forecasting Tool'}
                </TabsTrigger>
              </TabsList>

              {/* ERR Tab */}
              <TabsContent value="err">
                <form onSubmit={handleErrLogin}>
                  <div className="space-y-5">
                    {error && (
                      <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                        {error}
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="errEmail" className="text-gray-700 font-medium text-sm">
                        {t('login:email') || 'Email'}
                      </Label>
                      <Input
                        id="errEmail"
                        type="email"
                        placeholder="example@email.com"
                        value={errEmail}
                        onChange={(e) => setErrEmail(e.target.value)}
                        className="rounded-lg border-gray-300 bg-white focus:bg-white py-2.5 px-4 text-sm"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="errPassword" className="text-gray-700 font-medium text-sm">
                          {t('login:password') || 'Password'}
                        </Label>
                        <Link 
                          href="/forgot-password" 
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {t('login:forgot_password') || 'Forgot Password'}??
                        </Link>
                      </div>
                      <Input
                        id="errPassword"
                        type="password"
                        placeholder="At least 8 characters"
                        value={errPassword}
                        onChange={(e) => setErrPassword(e.target.value)}
                        className="rounded-lg border-gray-300 bg-white focus:bg-white py-2.5 px-4 text-sm"
                        required
                      />
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full rounded-lg mt-6 bg-blue-900 hover:bg-blue-950 text-white font-medium py-2.5 text-base"
                      disabled={isLoading}
                    >
                      {isLoading ? t('login:signing_in') || 'Signing in...' : t('login:sign_in') || 'Sign in'}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              {/* Donor Tab */}
              <TabsContent value="donor">
                <form onSubmit={handlePartnerLogin}>
                  <div className="space-y-5">
                    <div className="text-sm text-gray-600 mb-4 pb-3 border-b border-gray-300">
                      {t('login:partner_forecast_note')}
                    </div>
                    {error && (
                      <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
                        {error}
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-700 font-medium text-sm">
                        {t('login:email') || 'Email'}
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="example@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="rounded-lg border-gray-300 bg-white focus:bg-white py-2.5 px-4 text-sm"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-gray-700 font-medium text-sm">
                          {t('login:password') || 'Password'}
                        </Label>
                        <Link 
                          href="/forgot-password" 
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {t('login:forgot_password') || 'Forgot Password'}??
                        </Link>
                      </div>
                      <Input
                        id="password"
                        type="password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="rounded-lg border-gray-300 bg-white focus:bg-white py-2.5 px-4 text-sm"
                        required
                      />
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full rounded-lg mt-6 bg-blue-900 hover:bg-blue-950 text-white font-medium py-2.5 text-base"
                      disabled={isLoading}
                    >
                      {isLoading ? t('login:signing_in') || 'Signing in...' : t('login:sign_in') || 'Sign in'}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>

            {/* Divider */}
            <div className="flex items-center my-8 gap-4">
              <div className="flex-1 h-px bg-gray-400"></div>
              <span className="text-gray-500 text-sm font-medium">{t('common:or') || 'or'}</span>
              <div className="flex-1 h-px bg-gray-400"></div>
            </div>

            {/* Social Login Buttons */}
            <div className="space-y-4">
              <Button 
                type="button"
                variant="outline"
                className="w-full rounded-lg border-gray-300 hover:bg-gray-50 py-2.5 font-medium text-gray-700 flex items-center justify-center gap-3"
                onClick={() => window.open('#', '_blank')}
              >
                <Image src="/google-icon.svg" alt="Google" width={20} height={20} />
                {t('login:sign_with_google') || 'sign_with_google'}
              </Button>
              <Button 
                type="button"
                variant="outline"
                className="w-full rounded-lg border-gray-300 hover:bg-gray-50 py-2.5 font-medium text-gray-700 flex items-center justify-center gap-3"
                onClick={() => window.open('#', '_blank')}
              >
                <Image src="/facebook-icon.svg" alt="Facebook" width={20} height={20} />
                {t('login:sign_with_facebook') || 'sign_with_facebook'}
              </Button>
            </div>

            {/* Sign Up Link */}
            <p className="text-center mt-8 text-sm text-gray-600">
              {t('login:no_account') || 'no_account'} <Link href="/signup" className="text-blue-600 hover:text-blue-800 font-bold">{t('login:sign_up') || 'sign_up'}</Link>
            </p>
          </div>
        </div>

        {/* Right Column - Flower Artwork */}
        <div className="w-2/5 h-4/5 bg-gradient-to-br from-gray-900 via-black to-gray-800 flex items-center justify-center relative overflow-hidden rounded-3xl">
          <div className="w-full h-full flex items-center justify-center p-8">
            <Image
              src="/login-flowers.jpg"
              alt="Decorative flowers"
              width={500}
              height={700}
              priority
              className="w-full h-full object-cover rounded-2xl"
            />
          </div>
        </div>
      </div>
    </div>
  )
} 