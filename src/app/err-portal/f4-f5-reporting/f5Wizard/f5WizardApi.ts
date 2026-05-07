/** Thin fetch wrappers for F5 wizard — keeps UploadF5Modal free of duplicate URLs/options */

export async function f5UploadInit (projectId: string, ext: string): Promise<{ file_key_temp: string }> {
  const initRes = await fetch('/api/f4/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, ext }),
  })
  const initJson = await initRes.json()
  if (!initRes.ok) throw new Error(initJson.error || 'Init failed')
  return { file_key_temp: initJson.file_key_temp as string }
}

export async function f5ParseSnips (form: FormData): Promise<unknown> {
  const res = await fetch('/api/f5/parse-snips', { method: 'POST', body: form })
  const json = await res.json()
  if (!res.ok) throw new Error((json as { error?: string }).error || 'Snippet parse failed')
  return json
}

export async function f5Save (body: {
  project_id: string
  summary: unknown
  reach: unknown[]
  file_key_temp: string
}): Promise<void> {
  const res = await fetch('/api/f5/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Save failed')
}
