'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export default function Home() {
  const [isLoading, setIsLoading] = useState(true)
  const [userType, setUserType] = useState<'donor' | 'err' | null>(null)

  useEffect(() => {
    // Wrap in setTimeout to allow initial render
    setTimeout(() => {
      const isAuthenticated = localStorage.getItem('isAuthenticated')
      if (!isAuthenticated) {
        window.location.href = '/login'
        return
      }

      // Determine user type
      const donor = localStorage.getItem('donor')
      const user = localStorage.getItem('user')
      
      if (donor) setUserType('donor')
      if (user) setUserType('err')
      
      setIsLoading(false)
    }, 100)
  }, [])

  const handleLogout = () => {
    // Clear localStorage
    localStorage.clear()
    
    // Clear cookies
    document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    
    window.location.href = '/login'
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-12">
        <Image
          src="/logo.jpg"
          alt="LCC Sudan Logo"
          width={163}
          height={190}
          priority
          style={{ margin: 'auto' }}
          unoptimized
        />
        <h1 className="text-4xl font-bold mb-4">Mutual Aid Sudan Portal</h1>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.open('https://lccsudan.org/', '_blank')}
        >
          Visit LCC Sudan Website
        </Button>
      </div>
      
      <nav className="space-y-4">
        {userType === 'donor' && (
          <Link href="/forecast">
            <Button className="w-full justify-start text-left" variant="outline">
              📊 Forecasting Tool
            </Button>
          </Link>
        )}
        {userType === 'err' && (
          <Link href="/dashboard">
            <Button className="w-full justify-start text-left" variant="outline">
              📈 Dashboard
            </Button>
          </Link>
        )}
        <Button 
          className="w-full justify-start text-left mt-8" 
          variant="outline"
          onClick={handleLogout}
        >
          🚪 Logout
        </Button>
      </nav>
    </div>
  )
}
