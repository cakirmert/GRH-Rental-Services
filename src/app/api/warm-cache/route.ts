// src/app/api/warm-cache/route.ts
import { NextRequest, NextResponse } from "next/server"
import { warmImageCache } from "@/lib/cacheWarmer"

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication check (only if token is set)
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CACHE_WARM_TOKEN
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await warmImageCache()
    
    return NextResponse.json({ 
      success: true, 
      message: 'Cache warming completed' 
    })
  } catch (error) {
    console.error('Cache warming failed:', error)
    return NextResponse.json({ 
      error: 'Cache warming failed' 
    }, { status: 500 })
  }
}

// Allow GET for manual testing
export async function GET() {
  return NextResponse.json({ 
    message: 'Use POST to warm cache',
    endpoint: '/api/warm-cache'
  })
}
