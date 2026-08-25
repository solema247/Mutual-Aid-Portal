import { supabase } from '@/lib/supabaseClient'

/** Storage object keys reject characters like [] # ? %, which cause a 400 from Supabase. */
export function sanitizeStorageFileName(name: string): string {
  const base = (name || 'file').split(/[/\\]/).pop() || 'file'
  const cleaned = base
    .replace(/\s+/g, '_')
    .replace(/[^\w.\-()]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return (cleaned || 'file').slice(0, 180)
}

export async function openCommunityApprovalFile(fileKey: string): Promise<void> {
  const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(fileKey)}`)
  if (!response.ok) throw new Error('Failed to get signed URL')
  const { url, error } = await response.json()
  if (error || !url) throw new Error(error || 'No URL returned')
  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function uploadCommunityApprovalFile(
  projectId: string,
  file: File,
  previousKey?: string | null
): Promise<{ error: Error | null }> {
  const key = `f2-approvals/${projectId}/${Date.now()}-${sanitizeStorageFileName(file.name)}`
  const { error: upErr } = await supabase.storage.from('images').upload(key, file, {
    upsert: true,
    contentType: file.type || undefined,
  })
  if (upErr) return { error: upErr }

  const resp = await fetch('/api/f2/uncommitted', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, approval_file_key: key }),
  })
  if (!resp.ok) return { error: new Error('Failed to save approval file') }

  if (previousKey && previousKey !== key) {
    try {
      await supabase.storage.from('images').remove([previousKey])
    } catch {
      // Leave the previous object if cleanup fails; the new key is already saved.
    }
  }
  return { error: null }
}
