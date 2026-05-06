/** Thin fetch wrappers for F4 wizard — keeps UploadF4Modal free of duplicate URLs/options */

export async function f4UploadInit (projectId: string, ext: string): Promise<{ file_key_temp: string }> {
  const initRes = await fetch('/api/f4/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ext }),
  })
  const initJson = await initRes.json()
  if (!initRes.ok) throw new Error(initJson.error || 'Init failed')
  return { file_key_temp: initJson.file_key_temp as string }
}

export async function f4ParseSnips (form: FormData): Promise<unknown> {
  const res = await fetch('/api/f4/parse-snips', { method: 'POST', body: form })
  const json = await res.json()
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Snippet parse failed')
  return json
}

export async function f4Save (body: {
  project_id: string
  summary: unknown
  expenses: unknown[]
  file_key_temp: string
}): Promise<void> {
  const res = await fetch('/api/f4/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Save failed')
}
