'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ERR login state
  const [errId, setErrId] = useState('')
  const [pin, setPin] = useState('')

  // Partner login state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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

      // Check if temporary password
      if (authData.user?.user_metadata?.is_temporary_password) {
        console.log('Redirecting to change password...')
        await new Promise(resolve => setTimeout(resolve, 1000)) // Delay to see logs
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
      <div className="text-center mb-8">
        <Image
          src="/logo.jpg"
          alt="LCC Sudan Logo"
          width={300}
          height={350}
          priority
          style={{ margin: 'auto' }}
          className="mb-6"
        />
        <h1 className="text-2xl font-bold mb-4">Mutual Aid Sudan Portal</h1>
        <Button
          variant="outline"
          className="mb-8 border-2 rounded-full"
          onClick={() => window.open('https://lccsudan.org/', '_blank')}
        >
          Visit LCC Sudan Website
        </Button>
      </div>

      <Card className="w-full max-w-md border-2 rounded-3xl">
        <CardHeader>
          <h2 className="text-xl font-bold">Login</h2>
          <p className="text-sm text-muted-foreground">
            Access Mutual Aid Sudan Portal
          </p>
        </CardHeader>

        <Tabs defaultValue="err" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="err" className="rounded-full">ERR Staff</TabsTrigger>
            <TabsTrigger value="donor" className="rounded-full">Partner</TabsTrigger>
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
                  <Label htmlFor="errId">ERR ID</Label>
                  <Input
                    id="errId"
                    value={errId}
                    onChange={(e) => setErrId(e.target.value)}
                    className="rounded-full"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN</Label>
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
                  {isLoading ? 'Signing in...' : 'Sign in'}
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
                  <Label htmlFor="email">Email</Label>
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
                  <Label htmlFor="password">Password</Label>
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
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </CardContent>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
} 