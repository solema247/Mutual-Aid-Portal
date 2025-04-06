import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">LCC Portal</h1>
      
      <nav className="space-y-4">
        <Link href="/forecast">
          <Button className="w-full justify-start text-left" variant="outline">
            📊 Forecasting Tool
          </Button>
        </Link>
        {/* Add more navigation links here as needed */}
      </nav>
    </div>
  )
}
