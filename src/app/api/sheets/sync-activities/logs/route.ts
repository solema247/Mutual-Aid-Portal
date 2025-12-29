import { NextResponse } from 'next/server'
import { syncLogger } from '@/lib/syncLogger'

/**
 * GET endpoint to view sync logs
 * Query params:
 *   - lines: number of recent log lines to return (default: 100, max: 1000)
 *   - stats: if true, returns sync statistics instead of logs
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const linesParam = searchParams.get('lines')
    const statsParam = searchParams.get('stats')

    const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined

    if (statsParam === 'true') {
      // Return sync statistics
      const stats = syncLogger.getSyncStats()
      return NextResponse.json({
        success: true,
        stats: {
          ...stats,
          isServerless,
          logFile: isServerless ? 'N/A (serverless environment)' : 'logs/sync-activities.log',
          logFiles: isServerless ? [] : [
            'logs/sync-activities.log',
            'logs/sync-activities.log.1',
            'logs/sync-activities.log.2',
            'logs/sync-activities.log.3',
            'logs/sync-activities.log.4',
            'logs/sync-activities.log.5'
          ],
          note: isServerless ? 'File-based logging is not available in serverless environments. Check Vercel function logs instead.' : undefined
        }
      })
    }

    // Return log lines
    const lines = linesParam ? Math.min(parseInt(linesParam, 10), 1000) : 100
    const logLines = syncLogger.getRecentLogs(lines)

    return NextResponse.json({
      success: true,
      isServerless,
      lines: logLines.length,
      requested: lines,
      logs: logLines,
      logFile: isServerless ? 'N/A (serverless environment)' : 'logs/sync-activities.log',
      note: isServerless ? 'File-based logging is not available in serverless environments. Check Vercel function logs instead.' : undefined
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to retrieve logs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

