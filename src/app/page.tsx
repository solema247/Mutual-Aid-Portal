'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  const [isLoading, setIsLoading] = useState(true)
  const [userType, setUserType] = useState<'donor' | 'err' | null>(null)

  useEffect(() => {
    // Check authentication status
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
      <h1 className="text-3xl font-bold mb-6">LCC Portal</h1>
      
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
