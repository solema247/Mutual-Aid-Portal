const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repo = path.join(__dirname, '..')
const root = path.join(repo, 'src/app/err-portal/f3-mous')
const components = path.join(root, 'components')
const footer = '\n  )\n}\n'

const original = execSync('git show HEAD:src/app/err-portal/f3-mous/page.tsx', {
  cwd: repo,
  encoding: 'utf8',
})
const lines = original.split(/\r?\n/)

function headerOf(filePath, splitAt = 'return (') {
  return fs.readFileSync(filePath, 'utf8').split(splitAt)[0] + splitAt
}

function replacePreviewHandlers(body) {
  let result = body.replace(
    /onOpenChange=\{\(open\) => \{[\s\S]*?\}\}/,
    'onOpenChange={handlePreviewOpenChange}'
  )

  result = result.replace(
    /<Button\s+onClick=\{async \(\) => \{[\s\S]*?\{saving \? 'Saving\.\.\.' : 'Save Changes'\}[\s\S]*?<\/Button>/,
    `<Button
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>`
  )

  result = result.replace(
    /<Button\s+variant="outline"\s+onClick=\{\(\) => \{[\s\S]*?setEditMode\(true\)[\s\S]*?>\s*Edit\s*<\/Button>/,
    `<Button
                      variant="outline"
                      onClick={startEditMode}
                    >
                      Edit
                    </Button>`
  )

  return result
}

function replacePaymentHandlers(body) {
  let result = body.replace(
    /onOpenChange=\{\(open\) => \{[\s\S]*?\}\}/,
    'onOpenChange={(open) => { setPaymentModalOpen(open); if (!open) closePaymentModal() }}'
  )

  result = result.replace(
    /<Button\s+variant="outline"\s+onClick=\{\(\) => \{[\s\S]*?setBulkPaymentTransferDate\(''\)[\s\S]*?>\s*Close\s*<\/Button>/,
    `<Button
                variant="outline"
                onClick={closePaymentModal}
              >
                Close
              </Button>`
  )

  return result
}

function replaceListHandlers(body) {
  return body.replace(
    /onOpenChange=\{\(open\) => \{[\s\S]*?\}\}/,
    'onOpenChange={handleListProjectsModalOpenChange}'
  )
}

// MouPreviewDialog
{
  const body = replacePreviewHandlers(lines.slice(1468, 2574).join('\n'))
  fs.writeFileSync(
    path.join(components, 'MouPreviewDialog.tsx'),
    headerOf(path.join(components, 'MouPreviewDialog.tsx')) + body + footer,
    'utf8'
  )
  console.log('MouPreviewDialog rebuilt')
}

// PaymentConfirmationDialog
{
  const body = replacePaymentHandlers(lines.slice(3450, 3798).join('\n'))
  fs.writeFileSync(
    path.join(components, 'PaymentConfirmationDialog.tsx'),
    headerOf(path.join(components, 'PaymentConfirmationDialog.tsx')) + body + footer,
    'utf8'
  )
  console.log('PaymentConfirmationDialog rebuilt')
}

// ListProjectsDialog - restore UTF-8 then re-apply handler fixes from hook
{
  let body = replaceListHandlers(lines.slice(2576, 2827).join('\n'))

  body = body.replace(
    /onClick=\{async \(\) => \{[\s\S]*?Remove[\s\S]*?<\/Button>/,
    `onClick={() => removeProject(p.id)}
                                  >
                                    Remove
                                  </Button>`
  )

  body = body.replace(
    /<Button\s+variant="outline"\s+onClick=\{async \(\) => \{[\s\S]*?Add projects[\s\S]*?<\/Button>/,
    `<Button
                      variant="outline"
                      onClick={startAddMode}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add projects
                    </Button>`
  )

  body = body.replace(
    /<Button\s+disabled=\{selectedCandidates\.size === 0 \|\| listProjectsActionLoading\}\s+onClick=\{async \(\) => \{[\s\S]*?Add selected[\s\S]*?<\/Button>/,
    `<Button
                        disabled={selectedCandidates.size === 0 || listProjectsActionLoading}
                        onClick={addSelectedProjects}
                      >
                        Add selected ({selectedCandidates.size})
                      </Button>`
  )

  fs.writeFileSync(
    path.join(components, 'ListProjectsDialog.tsx'),
    headerOf(path.join(components, 'ListProjectsDialog.tsx')) + body + footer,
    'utf8'
  )
  console.log('ListProjectsDialog rebuilt')
}

// Verify
for (const file of ['MouPreviewDialog.tsx', 'PaymentConfirmationDialog.tsx', 'ListProjectsDialog.tsx']) {
  const content = fs.readFileSync(path.join(components, file), 'utf8')
  const bad = /âœ|â€|Ø§Ù/.test(content)
  console.log(file, bad ? 'STILL HAS CORRUPTION' : 'OK')
  if (content.includes('تلتزم')) console.log(file, 'has Arabic OK')
  if (content.includes('✓')) console.log(file, 'has checkmark OK')
}
