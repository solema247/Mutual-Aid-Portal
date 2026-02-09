# Sync Logging System

The sync system now includes comprehensive logging to help you monitor and troubleshoot the automated Google Sheets sync.

## Log File Location

Logs are saved to: `logs/sync-activities.log`

The log file automatically rotates when it exceeds 10MB, keeping up to 5 rotated log files:
- `logs/sync-activities.log` (current)
- `logs/sync-activities.log.1` (most recent rotated)
- `logs/sync-activities.log.2`
- `logs/sync-activities.log.3`
- `logs/sync-activities.log.4`
- `logs/sync-activities.log.5` (oldest rotated)

## Checking Sync Status

### Using the Command Line Script

```bash
# Show sync status (default)
node scripts/check-sync-status.js

# Show detailed statistics
node scripts/check-sync-status.js stats

# View recent logs (last 50 lines)
node scripts/check-sync-status.js logs

# View recent logs (last 100 lines)
node scripts/check-sync-status.js logs 100
```

### Using the API Endpoints

#### View Recent Logs

```bash
# Get last 100 log lines
curl http://localhost:3000/api/sheets/sync-activities/logs?lines=100

# Or in browser
http://localhost:3000/api/sheets/sync-activities/logs?lines=100
```

#### View Sync Statistics

```bash
# Get sync statistics
curl http://localhost:3000/api/sheets/sync-activities/logs?stats=true

# Or in browser
http://localhost:3000/api/sheets/sync-activities/logs?stats=true
```

## Log Format

Each log entry includes:
- **Timestamp**: ISO 8601 format (e.g., `2024-01-15T10:30:45.123Z`)
- **Level**: `INFO`, `WARN`, `ERROR`, or `SUCCESS`
- **Sync ID**: Unique identifier for each sync operation
- **Message**: Human-readable log message
- **Details**: Optional JSON object with additional context

Example log entry:
```
[2024-01-15T10:30:45.123Z] [INFO] [Sync: sync-1705315845123-abc123] 🚀 Sync started | Details: {"syncId":"sync-1705315845123-abc123"}
```

## What Gets Logged

The sync system logs:

1. **Sync Start**: When a sync operation begins (manual or cron)
2. **Data Fetching**: Number of rows fetched from Google Sheets
3. **Deduplication**: How many rows were deduplicated
4. **Batch Processing**: Progress for each batch of records
5. **Row-Level Errors**: Detailed errors for individual rows that fail
6. **Orphaned Record Cleanup**: Records deleted from database that are no longer in the sheet
7. **Sync Completion**: Summary of the sync operation (success/failure, counts, etc.)

## Monitoring Auto-Sync

The cron job runs every 5 minutes (configured in `vercel.json`). To verify it's working:

1. **Check the logs**:
   ```bash
   node scripts/check-sync-status.js logs 50
   ```

2. **Check sync frequency**:
   ```bash
   node scripts/check-sync-status.js stats
   ```
   
   This will show:
   - Last sync time
   - Number of recent syncs
   - Number of errors
   - Warnings if sync hasn't run recently

3. **Expected behavior**:
   - Syncs should occur approximately every 5 minutes
   - If last sync was more than 10 minutes ago, you'll see a warning
   - Each sync should show a "Sync completed" entry with success status

## Troubleshooting

### No Log File Found

If you see "No log file found":
- The sync may not have run yet
- Check that the `logs/` directory exists and is writable
- Try triggering a manual sync: `GET /api/sheets/sync-activities`

### Sync Not Running Automatically

If syncs aren't happening every 5 minutes:
1. Check Vercel cron job configuration in `vercel.json`
2. Verify the cron job is enabled in your Vercel project settings
3. Check Vercel function logs for cron execution errors
4. Ensure environment variables are set correctly in Vercel

### High Error Rate

If you see many errors in the logs:
1. Review the error details in the log entries
2. Check for data type mismatches (common issues: commas in numbers, invalid dates)
3. Verify Google Sheets API permissions
4. Check Supabase connection and table schema

## Log Retention

- Current log file: Up to 10MB
- Rotated logs: Up to 5 files × 10MB = 50MB total
- Old logs are automatically deleted when rotation occurs

## Manual Sync Testing

To test the sync manually and see logs:

```bash
# Trigger sync via GET request
curl http://localhost:3000/api/sheets/sync-activities

# Then check logs
node scripts/check-sync-status.js logs
```

## Integration with Monitoring

You can integrate the logging system with external monitoring tools:

1. **File-based monitoring**: Set up log file watchers (e.g., `tail -f logs/sync-activities.log`)
2. **API-based monitoring**: Poll `/api/sheets/sync-activities/logs?stats=true` periodically
3. **Error alerts**: Parse logs for `[ERROR]` entries and send alerts

## Example: Setting Up Log Monitoring

```bash
# Watch logs in real-time
tail -f logs/sync-activities.log | grep -E "\[ERROR\]|\[SUCCESS\]"

# Check sync health every hour
*/60 * * * * node scripts/check-sync-status.js stats > /tmp/sync-status.log
```

