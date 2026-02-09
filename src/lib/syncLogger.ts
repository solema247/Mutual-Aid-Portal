/**
 * Logger for sync operations
 * Logs to both console and file for monitoring
 */

import fs from 'fs'
import path from 'path'

// Check if we're in a serverless environment (Vercel, etc.)
const IS_SERVERLESS = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined

const LOG_DIR = path.join(process.cwd(), 'logs')
const SYNC_LOG_FILE = path.join(LOG_DIR, 'sync-activities.log')
const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_LOG_FILES = 5 // Keep 5 rotated log files

// Ensure log directory exists (only in non-serverless environments)
function ensureLogDir() {
  if (IS_SERVERLESS) return
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true })
    }
  } catch (error) {
    // Silently fail in serverless environments
  }
}

// Rotate log file if it gets too large (only in non-serverless environments)
function rotateLogIfNeeded() {
  if (IS_SERVERLESS) return
  try {
    ensureLogDir()
    
    if (fs.existsSync(SYNC_LOG_FILE)) {
      const stats = fs.statSync(SYNC_LOG_FILE)
      if (stats.size > MAX_LOG_SIZE) {
        // Rotate existing logs
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
          const oldFile = `${SYNC_LOG_FILE}.${i}`
          const newFile = `${SYNC_LOG_FILE}.${i + 1}`
          if (fs.existsSync(oldFile)) {
            if (fs.existsSync(newFile)) {
              fs.unlinkSync(newFile)
            }
            fs.renameSync(oldFile, newFile)
          }
        }
        
        // Move current log to .1
        fs.renameSync(SYNC_LOG_FILE, `${SYNC_LOG_FILE}.1`)
      }
    }
  } catch (error) {
    // Silently fail in serverless environments
  }
}

export interface SyncLogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
  details?: any
  syncId?: string
}

class SyncLogger {
  private currentSyncId: string | null = null

  private formatLogEntry(level: SyncLogEntry['level'], message: string, details?: any): string {
    try {
      const timestamp = new Date().toISOString()
      const syncId = this.currentSyncId || 'unknown'
      let detailsStr = ''
      if (details) {
        try {
          // Try to stringify, but limit size and handle circular references
          const detailsJson = JSON.stringify(details, null, 0)
          // Limit details to 1000 characters to prevent huge log entries
          detailsStr = ` | Details: ${detailsJson.length > 1000 ? detailsJson.substring(0, 1000) + '...' : detailsJson}`
        } catch (jsonError) {
          // If JSON.stringify fails (circular reference, etc.), use a safe representation
          detailsStr = ` | Details: [Object - could not serialize]`
        }
      }
      return `[${timestamp}] [${level.toUpperCase()}] [Sync: ${syncId}] ${message}${detailsStr}\n`
    } catch (error) {
      // Ultimate fallback - return basic log entry
      return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`
    }
  }

  startSync(syncId: string) {
    this.currentSyncId = syncId
    this.log('info', `🚀 Sync started`, { syncId })
  }

  endSync(success: boolean, summary: any) {
    const level = success ? 'success' : 'error'
    this.log(level, `✅ Sync completed`, summary)
    this.currentSyncId = null
  }

  log(level: SyncLogEntry['level'], message: string, details?: any) {
    // Console logging (for Vercel/server logs) - always works
    const consoleMethod = level === 'error' ? console.error : 
                          level === 'warn' ? console.warn : 
                          level === 'success' ? console.log : console.log
    
    const logEntry = this.formatLogEntry(level, message, details)
    consoleMethod(logEntry.trim(), details || '')

    // File logging (only in non-serverless environments)
    if (!IS_SERVERLESS) {
      try {
        rotateLogIfNeeded()
        ensureLogDir()
        fs.appendFileSync(SYNC_LOG_FILE, logEntry, 'utf8')
      } catch (error) {
        // Don't fail sync if logging fails
        console.error('Failed to write to log file:', error)
      }
    }
  }

  info(message: string, details?: any) {
    this.log('info', message, details)
  }

  warn(message: string, details?: any) {
    this.log('warn', message, details)
  }

  error(message: string, details?: any) {
    this.log('error', message, details)
  }

  success(message: string, details?: any) {
    this.log('success', message, details)
  }

  // Get recent logs (only works in non-serverless environments)
  getRecentLogs(lines: number = 100): string[] {
    if (IS_SERVERLESS) {
      return ['File-based logging is not available in serverless environments. Check Vercel function logs instead.']
    }
    try {
      if (!fs.existsSync(SYNC_LOG_FILE)) {
        return ['No log file found']
      }

      const logContent = fs.readFileSync(SYNC_LOG_FILE, 'utf8')
      const logLines = logContent.split('\n').filter(line => line.trim())
      return logLines.slice(-lines)
    } catch (error) {
      return [`Error reading logs: ${error instanceof Error ? error.message : 'Unknown error'}`]
    }
  }

  // Get sync statistics (only works in non-serverless environments)
  getSyncStats(): {
    lastSync: string | null
    recentSyncs: number
    recentErrors: number
    totalLogSize: number
  } {
    if (IS_SERVERLESS) {
      return {
        lastSync: null,
        recentSyncs: 0,
        recentErrors: 0,
        totalLogSize: 0
      }
    }
    try {
      if (!fs.existsSync(SYNC_LOG_FILE)) {
        return {
          lastSync: null,
          recentSyncs: 0,
          recentErrors: 0,
          totalLogSize: 0
        }
      }

      const logContent = fs.readFileSync(SYNC_LOG_FILE, 'utf8')
      const logLines = logContent.split('\n').filter(line => line.trim())
      
      // Get last 1000 lines for stats
      const recentLines = logLines.slice(-1000)
      
      const syncStarts = recentLines.filter(line => line.includes('Sync started'))
      const syncCompletes = recentLines.filter(line => line.includes('Sync completed'))
      const errors = recentLines.filter(line => line.includes('[ERROR]'))
      
      const lastSync = syncCompletes.length > 0 
        ? syncCompletes[syncCompletes.length - 1].match(/\[(.*?)\]/)?.[1] || null
        : null

      const stats = fs.statSync(SYNC_LOG_FILE)

      return {
        lastSync,
        recentSyncs: syncStarts.length,
        recentErrors: errors.length,
        totalLogSize: stats.size
      }
    } catch (error) {
      return {
        lastSync: null,
        recentSyncs: 0,
        recentErrors: 0,
        totalLogSize: 0
      }
    }
  }
}

export const syncLogger = new SyncLogger()

