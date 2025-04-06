'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ERR login state
  const [errId, setErrId] = useState('')
  const [pin, setPin] = useState('')

  // Donor login state
  const [login, setLogin] = useState('')
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

      // Redirect to portal
      window.location.href = '/'
    } catch (err) {
      console.error('Login error:', err)
      setError('Failed to login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDonorLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { data: donor, error: donorError } = await supabase
        .from('donor_users')
        .select('*, donors(name)')
        .eq('login', login)
        .single()

      if (!donor || donor.password_hash !== password) {
        setError('Invalid login or password')
        return
      }

      // Store in localStorage
      localStorage.setItem('donor', JSON.stringify(donor))
      localStorage.setItem('isAuthenticated', 'true')
      
      // Set cookies
      document.cookie = `isAuthenticated=true; path=/`
      document.cookie = `userType=donor; path=/`

      // Redirect to portal
      window.location.href = '/'
    } catch (err) {
      console.error('Login error:', err)
      setError('Failed to login. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Login</CardTitle>
          <CardDescription>
            Access the LCC portal
          </CardDescription>
        </CardHeader>

        <Tabs defaultValue="err" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="err">ERR Staff</TabsTrigger>
            <TabsTrigger value="donor">Donor</TabsTrigger>
          </TabsList>

          <TabsContent value="err">
            <form onSubmit={handleErrLogin}>
              <CardContent className="space-y-4">
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
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </CardFooter>
            </form>
          </TabsContent>

          <TabsContent value="donor">
            <form onSubmit={handleDonorLogin}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="login">Login</Label>
                  <Input
                    id="login"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
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
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                </Button>
              </CardFooter>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
} 