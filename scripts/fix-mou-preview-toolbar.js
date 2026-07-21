const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const repo = path.join(__dirname, '..')
const file = path.join(repo, 'src/app/err-portal/f3-mous/components/MouPreviewDialog.tsx')

const original = execSync('git show HEAD:src/app/err-portal/f3-mous/page.tsx', {
  cwd: repo,
  encoding: 'utf8',
})
const lines = original.split(/\r?\n/)

const header = fs.readFileSync(file, 'utf8').split('return (')[0] + 'return ('
let body = lines.slice(1468, 2574).join('\n')

body = body.replace(
  /onOpenChange=\{\(open\) => \{\s*setPreviewOpen\(open\)\s*if \(!open\) \{\s*setEditMode\(false\)\s*setEditingMou\(\{\}\)\s*\}\s*\}\}/,
  'onOpenChange={handlePreviewOpenChange}'
)

// Replace save handler only (between editMode cancel and closing fragment)
body = body.replace(
  /<Button\s*\n\s*onClick=\{async \(\) => \{\s*try \{\s*setSaving\(true\)[\s\S]*?\{saving \? 'Saving\.\.\.' : 'Save Changes'\}\s*<\/Button>/,
  `<Button
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>`
)

// Replace edit handler - from onClick with setEditMode(true) through Edit </Button>
body = body.replace(
  /<Button\s*\n\s*variant="outline"\s*\n\s*onClick=\{\(\) => \{\s*setEditMode\(true\)[\s\S]*?>\s*Edit\s*<\/Button>/,
  `<Button
                      variant="outline"
                      onClick={startEditMode}
                    >
                      Edit
                    </Button>`
)

fs.writeFileSync(file, header + body + '\n  )\n}\n', 'utf8')

const content = fs.readFileSync(file, 'utf8')
console.log('has Arabic:', content.includes('تلتزم'))
console.log('has handleSave:', content.includes('onClick={handleSave}'))
console.log('has startEditMode:', content.includes('onClick={startEditMode}'))
console.log('has Cancel in editMode:', /editMode \? \([\s\S]*Cancel/.test(content))
