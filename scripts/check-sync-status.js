#!/usr/bin/env node

/**
 * Check sync status and view recent logs
 */

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')

const LOG_DIR = path.join(process.cwd(), 'logs')
const SYNC_LOG_FILE = path.join(LOG_DIR, 'sync-activities.log')

function getRecentLogs(lines = 50) {
  try {
    if (!fs.existsSync(SYNC_LOG_FILE)) {
      return ['No log file found. Sync may not have run yet.']
    }

    const logContent = fs.readFileSync(SYNC_LOG_FILE, 'utf8')
    const logLines = logContent.split('\n').filter(line => line.trim())
    return logLines.slice(-lines)
  } catch (error) {
    return [`Error reading logs: ${error.message}`]
  }
}

function getSyncStats() {
  try {
    if (!fs.existsSync(SYNC_LOG_FILE)) {
      return {
        lastSync: null,
        recentSyncs: 0,
        recentErrors: 0,
        totalLogSize: 0,
        logFileExists: false
      }
    }

    const logContent = fs.readFileSync(SYNC_LOG_FILE, 'utf8')
    const logLines = logContent.split('\n').filter(line => line.trim())
    
    // Get last 1000 lines for stats
    const recentLines = logLines.slice(-1000)
    
    const syncStarts = recentLines.filter(line => line.includes('Sync started'))
    const syncCompletes = recentLines.filter(line => line.includes('Sync completed'))
    const errors = recentLines.filter(line => line.includes('[ERROR]'))
    const warnings = recentLines.filter(line => line.includes('[WARN]'))
    
    const lastSyncLine = syncCompletes.length > 0 
      ? syncCompletes[syncCompletes.length - 1]
      : null
    
    const lastSync = lastSyncLine 
      ? lastSyncLine.match(/\[(.*?)\]/)?.[1] || null
      : null

    const stats = fs.statSync(SYNC_LOG_FILE)
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2)

    // Parse last sync details
    let lastSyncDetails = null
    if (lastSyncLine) {
      const detailsMatch = lastSyncLine.match(/Details: ({.*})/)
      if (detailsMatch) {
        try {
          lastSyncDetails = JSON.parse(detailsMatch[1])
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    return {
      lastSync,
      recentSyncs: syncStarts.length,
      recentErrors: errors.length,
      recentWarnings: warnings.length,
      totalLogSize: stats.size,
      totalLogSizeMB: fileSizeMB,
      logFileExists: true,
      lastSyncDetails
    }
  } catch (error) {
    return {
      lastSync: null,
      recentSyncs: 0,
      recentErrors: 0,
      recentWarnings: 0,
      totalLogSize: 0,
      totalLogSizeMB: '0.00',
      logFileExists: false,
      error: error.message
    }
  }
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never'
  
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute(s) ago`
    if (diffHours < 24) return `${diffHours} hour(s) ago`
    return `${diffDays} day(s) ago`
  } catch (e) {
    return timestamp
  }
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0] || 'status'

  if (command === 'logs') {
    const lines = parseInt(args[1] || '50', 10)
    console.log(`\n📋 Recent Sync Logs (last ${lines} lines):\n`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    const logs = getRecentLogs(lines)
    logs.forEach(line => console.log(line))
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return
  }

  if (command === 'stats') {
    const stats = getSyncStats()
    console.log('\n📊 Sync Statistics:\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`   Log File: ${SYNC_LOG_FILE}`)
    console.log(`   Log File Exists: ${stats.logFileExists ? '✅ Yes' : '❌ No'}`)
    if (stats.logFileExists) {
      console.log(`   Log File Size: ${stats.totalLogSizeMB} MB`)
      console.log(`   Last Sync: ${stats.lastSync ? formatTimeAgo(stats.lastSync) : 'Never'}`)
      console.log(`   Recent Syncs (last 1000 log lines): ${stats.recentSyncs}`)
      console.log(`   Recent Errors: ${stats.recentErrors}`)
      console.log(`   Recent Warnings: ${stats.recentWarnings}`)
      
      if (stats.lastSyncDetails) {
        console.log('\n   Last Sync Details:')
        console.log(`      Rows Synced: ${stats.lastSyncDetails.synced || 'N/A'}`)
        console.log(`      Total Rows: ${stats.lastSyncDetails.total_rows || 'N/A'}`)
        console.log(`      Deduplicated Rows: ${stats.lastSyncDetails.deduplicated_rows || 'N/A'}`)
        console.log(`      Orphaned Deleted: ${stats.lastSyncDetails.orphaned_deleted || 0}`)
        console.log(`      Errors: ${stats.lastSyncDetails.errors || 0}`)
      }
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    return
  }

  // Default: show status
  const stats = getSyncStats()
  console.log('\n🔍 Sync Status:\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  if (!stats.logFileExists) {
    console.log('⚠️  No log file found.')
    console.log('   The sync may not have run yet, or logs directory is not accessible.')
    console.log('   Log file location: ' + SYNC_LOG_FILE)
  } else {
    console.log(`✅ Log file exists: ${SYNC_LOG_FILE}`)
    console.log(`   Size: ${stats.totalLogSizeMB} MB`)
    console.log(`\n📈 Recent Activity:`)
    console.log(`   Last Sync: ${stats.lastSync ? formatTimeAgo(stats.lastSync) : 'Never'}`)
    console.log(`   Syncs in last 1000 log lines: ${stats.recentSyncs}`)
    console.log(`   Errors: ${stats.recentErrors}`)
    console.log(`   Warnings: ${stats.recentWarnings}`)
    
    if (stats.lastSyncDetails) {
      console.log(`\n📊 Last Sync Results:`)
      console.log(`   Rows Synced: ${stats.lastSyncDetails.synced || 0}`)
      console.log(`   Total Rows from Sheet: ${stats.lastSyncDetails.total_rows || 0}`)
      console.log(`   Deduplicated: ${stats.lastSyncDetails.deduplicated_rows || 0}`)
      console.log(`   Orphaned Deleted: ${stats.lastSyncDetails.orphaned_deleted || 0}`)
      console.log(`   Errors: ${stats.lastSyncDetails.errors || 0}`)
    }

    // Check if sync is running regularly (should run every 5 minutes)
    if (stats.lastSync) {
      const lastSyncDate = new Date(stats.lastSync)
      const now = new Date()
      const minutesSinceLastSync = Math.floor((now - lastSyncDate) / 60000)
      
      if (minutesSinceLastSync > 10) {
        console.log(`\n⚠️  Warning: Last sync was ${minutesSinceLastSync} minutes ago`)
        console.log(`   Expected sync frequency: Every 5 minutes`)
        console.log(`   Sync may not be running automatically.`)
      } else {
        console.log(`\n✅ Sync is running regularly (last sync ${minutesSinceLastSync} minute(s) ago)`)
      }
    }
  }
  
  console.log('\n💡 Usage:')
  console.log('   node scripts/check-sync-status.js          - Show status')
  console.log('   node scripts/check-sync-status.js stats   - Show detailed statistics')
  console.log('   node scripts/check-sync-status.js logs     - Show recent logs (50 lines)')
  console.log('   node scripts/check-sync-status.js logs 100 - Show recent logs (100 lines)')
  console.log('\n🌐 API Endpoints:')
  console.log('   GET /api/sheets/sync-activities/logs?lines=100 - View logs via API')
  console.log('   GET /api/sheets/sync-activities/logs?stats=true - View stats via API')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(console.error)

