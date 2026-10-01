/** Load F1 file access for a portal project via overview + signed URL (server-enforced). */

export type ProjectOverviewPayload = {
  project?: {
    file_key?: string | null
    temp_file_key?: string | null
    grant_serial_id?: string | null
    grant_id?: string | null
    grant_call_id?: string | null
    project_name?: string | null
    project_objectives?: string | null
    err_id?: string | null
  } | null
  file_keys?: { f1_file?: string | null } | null
}

export function f1StorageKeyFromOverview(body: ProjectOverviewPayload): string | null {
  const key =
    body.file_keys?.f1_file?.trim() ||
    body.project?.file_key?.trim() ||
    body.project?.temp_file_key?.trim() ||
    ''
  return key || null
}

export async function fetchProjectOverview(
  projectId: string
): Promise<{ ok: true; data: ProjectOverviewPayload } | { ok: false; message: string }> {
  const id = projectId?.trim()
  if (!id || id.startsWith('historical_')) {
    return { ok: false, message: 'F1 is not available for this row.' }
  }
  try {
    const res = await fetch(`/api/overview/project/${encodeURIComponent(id)}`, { cache: 'no-store' })
    const body = (await res.json().catch(() => ({}))) as ProjectOverviewPayload & { error?: string }
    if (!res.ok) {
      return { ok: false, message: body.error || 'Unable to load project.' }
    }
    return { ok: true, data: body }
  } catch {
    return { ok: false, message: 'Unable to load project.' }
  }
}

export async function fetchF1SignedUrlForProject(
  projectId: string
): Promise<
  | { ok: true; url: string; overview: ProjectOverviewPayload }
  | { ok: false; message: string }
> {
  const overviewResult = await fetchProjectOverview(projectId)
  if (!overviewResult.ok) return overviewResult

  const storageKey = f1StorageKeyFromOverview(overviewResult.data)
  if (!storageKey) {
    return { ok: false, message: 'F1 file is not available for this project.' }
  }

  try {
    const urlRes = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(storageKey)}`)
    const urlBody = await urlRes.json().catch(() => ({}))
    if (!urlRes.ok || !urlBody.url) {
      return { ok: false, message: urlBody.error || 'Failed to open F1 file.' }
    }
    return { ok: true, url: urlBody.url as string, overview: overviewResult.data }
  } catch {
    return { ok: false, message: 'Failed to open F1 file.' }
  }
}

/** Open F1 file in a new browser tab (optional convenience). */
export async function openProjectF1InNewTab(
  projectId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await fetchF1SignedUrlForProject(projectId)
  if (!result.ok) return result
  window.open(result.url, '_blank', 'noopener,noreferrer')
  return { ok: true }
}
