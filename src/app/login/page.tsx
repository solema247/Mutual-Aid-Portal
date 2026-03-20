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
import LoginLanguageSwitch from '@/components/LoginLanguageSwitch'
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
  useEffect(() => {
    const clearStaleSession = async () => {
      const hash = window.location.hash
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1))
        const accessToken = hashParams.get('access_token')
        if (accessToken) return
      }
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // Ignore
      }
    }
    clearStaleSession()
  }, [])

  useEffect(() => {
    const handleMagicLinkAuth = async () => {
      const hash = window.location.hash
      if (!hash) return
      const hashParams = new URLSearchParams(hash.substring(1))
      const type = hashParams.get('type')
      const accessToken = hashParams.get('access_token')
      if (accessToken && type === 'recovery') {
        window.location.href = `/reset-password${hash}`
        return
      }
      if (accessToken && (type === 'magiclink' || !type)) {
        const refreshToken = hashParams.get('refresh_token')
        if (!refreshToken) return
        const { data: { session }, error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (setSessionError) return
        if (session) {
          window.history.replaceState(null, '', window.location.pathname)
          window.location.href = '/change-password'
        }
      }
    }
    handleMagicLinkAuth()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('password_reset') === 'success') {
      console.log('Password reset successful')
    }
  }, [])

  const handleErrLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: errEmail,
        password: errPassword
      })
      if (authError) {
        setError('Authentication failed')
        return
      }
      const needsPasswordChange = authData.user?.user_metadata?.is_temporary_password === true ||
        authData.user?.user_metadata?.has_changed_password === false
      if (needsPasswordChange) {
        window.location.href = '/change-password'
        return
      }
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .single()
      if (userError) {
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
      localStorage.setItem('user', JSON.stringify(userData))
      localStorage.setItem('isAuthenticated', 'true')
      document.cookie = `isAuthenticated=true; path=/`
      document.cookie = `userType=err; path=/`
      window.location.href = '/err-portal'
    } catch (err) {
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
      const { data: donor, error: donorError } = await supabase
        .from('donor_users')
        .select('*, donors(name)')
        .eq('id', authData.user?.id)
        .single()
      if (donorError || !donor) {
        setError('User not found or not authorized')
        return
      }
      localStorage.setItem('donor', JSON.stringify(donor))
      localStorage.setItem('isAuthenticated', 'true')
      document.cookie = `isAuthenticated=true; path=/`
      document.cookie = `userType=partner; path=/`
      await new Promise(resolve => setTimeout(resolve, 1000))
      window.location.href = '/partner-portal'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const errorBlock = error && (
    <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200">
      {error}
    </div>
  )

  const visitLccButton = (
    <Button
      variant="outline"
      type="button"
      className="rounded-lg border-2 border-gray-300 hover:bg-gray-50 text-gray-700 font-medium"
      onClick={() => window.open('https://lccsudan.org/', '_blank')}
    >
      {t('login:visit_lcc')}
    </Button>
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      {/* Mobile Layout */}
      <div className="lg:hidden w-full h-screen flex flex-col p-4">
        <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
          <div className="w-full flex justify-start mb-6">
            <LoginLanguageSwitch />
          </div>
          <Tabs defaultValue="err" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-8 h-auto bg-transparent border-b border-gray-200 rounded-none p-0 gap-2">
              <TabsTrigger
                value="err"
                className="rounded-lg whitespace-normal h-auto min-h-[36px] py-2 px-3 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-gray-100 data-[state=inactive]:text-gray-700 font-medium text-sm"
              >
                {t('login:err_staff')}
              </TabsTrigger>
              <TabsTrigger
                value="donor"
                className="rounded-lg whitespace-normal h-auto min-h-[36px] py-2 px-3 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-gray-100 data-[state=inactive]:text-gray-700 font-medium text-xs leading-tight"
              >
                {t('login:partner_forecast_access')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="err">
              <form onSubmit={handleErrLogin}>
                <div className="space-y-4">
                  {errorBlock}
                  <div className="space-y-2">
                    <Label htmlFor="errEmail" className="text-gray-700 font-medium text-sm">
                      {t('login:email')}
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
                        {t('login:password')}
                      </Label>
                      <Link
                        href="/forgot-password"
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {t('login:forgot_password')}
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
                    {isLoading ? t('login:signing_in') : t('login:sign_in')}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="donor">
              <form onSubmit={handlePartnerLogin}>
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4 pb-2 border-b border-gray-200">
                    {t('login:partner_forecast_note')}
                  </div>
                  {errorBlock}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-700 font-medium text-sm">
                      {t('login:email')}
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
                        {t('login:password')}
                      </Label>
                      <Link
                        href="/forgot-password"
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {t('login:forgot_password')}
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
                    {isLoading ? t('login:signing_in') : t('login:sign_in')}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-6 w-full flex justify-center">
            {visitLccButton}
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex w-full h-screen items-center justify-center">
        <div className="w-1/2 h-full flex flex-col items-center justify-center px-16">
          <div className="w-full max-w-sm">
            <div className="w-full flex justify-start mb-6">
              <LoginLanguageSwitch />
            </div>
            <Tabs defaultValue="err" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8 h-auto bg-transparent border-b border-gray-300 rounded-none p-0 gap-3">
                <TabsTrigger
                  value="err"
                  className="rounded-lg whitespace-normal h-auto min-h-[40px] py-2.5 px-6 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 font-medium text-base"
                >
                  {t('login:err_staff')}
                </TabsTrigger>
                <TabsTrigger
                  value="donor"
                  className="rounded-lg whitespace-normal h-auto min-h-[40px] py-2.5 px-6 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 font-medium text-base"
                >
                  {t('login:partner_forecast_access')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="err">
                <form onSubmit={handleErrLogin}>
                  <div className="space-y-5">
                    {errorBlock}
                    <div className="space-y-2">
                      <Label htmlFor="errEmail-desktop" className="text-gray-700 font-medium text-sm">
                        {t('login:email')}
                      </Label>
                      <Input
                        id="errEmail-desktop"
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
                        <Label htmlFor="errPassword-desktop" className="text-gray-700 font-medium text-sm">
                          {t('login:password')}
                        </Label>
                        <Link
                          href="/forgot-password"
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {t('login:forgot_password')}
                        </Link>
                      </div>
                      <Input
                        id="errPassword-desktop"
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
                      {isLoading ? t('login:signing_in') : t('login:sign_in')}
                    </Button>
                  </div>
                </form>
              </TabsContent>

              <TabsContent value="donor">
                <form onSubmit={handlePartnerLogin}>
                  <div className="space-y-5">
                    <div className="text-sm text-gray-600 mb-4 pb-3 border-b border-gray-300">
                      {t('login:partner_forecast_note')}
                    </div>
                    {errorBlock}
                    <div className="space-y-2">
                      <Label htmlFor="email-desktop" className="text-gray-700 font-medium text-sm">
                        {t('login:email')}
                      </Label>
                      <Input
                        id="email-desktop"
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
                        <Label htmlFor="password-desktop" className="text-gray-700 font-medium text-sm">
                          {t('login:password')}
                        </Label>
                        <Link
                          href="/forgot-password"
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {t('login:forgot_password')}
                        </Link>
                      </div>
                      <Input
                        id="password-desktop"
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
                      {isLoading ? t('login:signing_in') : t('login:sign_in')}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>

          </div>
        </div>

        {/* Right Column - Title, logos and Visit LCC */}
        <div className="w-[48%] max-w-2xl min-h-[620px] flex flex-col items-center justify-center p-8 rounded-3xl overflow-hidden border border-slate-200 bg-slate-100">
          <h2 className="text-4xl xl:text-5xl font-bold text-slate-800 text-center leading-tight whitespace-nowrap">Mutual Aid Portal</h2>
          <div className="flex-1 min-h-4" />
          <div className="w-full flex flex-col items-center gap-6">
            <div className="flex flex-row items-center justify-center gap-8">
              <Image
                src="/logo.jpg"
                alt="LCC Sudan Logo"
                width={200}
                height={230}
                priority
                className="w-[200px] h-auto object-contain"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/lohub.jpeg"
                alt="Localization Hub Logo"
                width={160}
                height={160}
                className="object-contain flex-shrink-0 w-[160px] h-[160px]"
              />
            </div>
            <span className="text-sm text-slate-600 text-center">
              {t('login:localization_hub_credit')}
            </span>
            {visitLccButton}
          </div>
        </div>
      </div>
    </div>
  )
}
