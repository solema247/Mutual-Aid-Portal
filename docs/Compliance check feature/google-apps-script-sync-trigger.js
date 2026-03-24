/**
 * Google Apps Script — FCDO Financial Report Live Sync Trigger
 * =============================================================
 *
 * How to set this up:
 *
 * 1. Open the Financial Report Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1ZeNFAk-K0ATw5nUZNVquakCWFOWcreMt63zfFQ3x3ec
 *
 * 2. Click Extensions → Apps Script
 *
 * 3. Paste this entire file into the editor (replace the default code).
 *
 * 4. Update PORTAL_URL and WEBHOOK_SECRET below.
 *
 * 5. Save (Ctrl+S), then click the clock icon (Triggers) in the left sidebar.
 *
 * 6. Add a trigger:
 *    - Choose function: onSheetChange
 *    - Event source: From spreadsheet
 *    - Event type: On change  (fires when any cell is edited or rows are added)
 *    - Failure notification: Notify me immediately
 *
 * 7. Authorize the script when prompted.
 *
 * The trigger will now call the portal's sync endpoint whenever the sheet changes.
 * It debounces by sheet name — editing Disbursement Overview only syncs that sheet.
 */

// ─── Config ──────────────────────────────────────────────────────────────────

var PORTAL_URL = 'https://your-portal-domain.com'; // e.g. https://lohub.vercel.app
var WEBHOOK_SECRET = ''; // Set SYNC_WEBHOOK_SECRET in your portal's env vars, paste value here
var SYNC_ENDPOINT = PORTAL_URL + '/api/compliance/sync-financial-report';

// Map from sheet tab name → API "sheet" param value
var SHEET_MAP = {
  'Spending Summary':    'spending_summary',
  'Disbursement Overview': 'disbursement',
  'F4s Report':          'f4s_report',
};

// ─── Trigger function ─────────────────────────────────────────────────────────

/**
 * Called by the "On change" trigger.
 * Determines which sheet was edited and syncs only that sheet.
 */
function onSheetChange(e) {
  var sheetName = e && e.source ? e.source.getActiveSheet().getName() : null;
  var sheetParam = sheetName ? SHEET_MAP[sheetName] : null;

  if (!sheetParam) {
    // Edited sheet is not one we sync (e.g. Dashboard), ignore
    Logger.log('onSheetChange: ignoring edit on sheet "' + sheetName + '"');
    return;
  }

  Logger.log('onSheetChange: syncing sheet "' + sheetName + '" (' + sheetParam + ')');
  callSyncEndpoint(sheetParam);
}

/**
 * Manual full sync — run this from the Apps Script editor when you want to
 * force a complete sync of all three sheets.
 */
function syncAll() {
  callSyncEndpoint('all');
}

// ─── HTTP call ────────────────────────────────────────────────────────────────

function callSyncEndpoint(sheetParam) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ sheet: sheetParam }),
    headers: {},
    muteHttpExceptions: true,
  };

  if (WEBHOOK_SECRET) {
    options.headers['Authorization'] = 'Bearer ' + WEBHOOK_SECRET;
  }

  try {
    var response = UrlFetchApp.fetch(SYNC_ENDPOINT, options);
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code === 200) {
      Logger.log('Sync succeeded (' + sheetParam + '): ' + body);
    } else {
      Logger.log('Sync failed (' + sheetParam + ') HTTP ' + code + ': ' + body);
      // Send email alert on failure (optional — remove if not needed)
      // MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Sync failed', body);
    }
  } catch (err) {
    Logger.log('Sync error (' + sheetParam + '): ' + err.message);
  }
}

// ─── One-time setup helper ────────────────────────────────────────────────────

/**
 * Run this once from the editor to install the trigger programmatically
 * (alternative to clicking the Triggers UI).
 */
function installTrigger() {
  // Remove any existing triggers for onSheetChange to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onSheetChange') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('onSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange()
    .create();

  Logger.log('Trigger installed for onSheetChange (onChange)');
}
