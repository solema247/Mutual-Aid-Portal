import { DEFAULT_GITHUB_ISSUES_REPO } from '@/lib/raiseTicketGithub'
import { resolveGithubProjectRef } from '@/lib/githubProjectApi'

type CreateGithubIssueInput = {
  title: string
  body: string
  label: string
  labelColor?: string
  labelDescription?: string
  typeOfTask?: string
  teamRequest?: string
}

type CreateGithubIssueResult = {
  html_url?: string
  number?: number
}

type SingleSelectField = {
  id: string
  name: string
  options: Array<{ id: string; name: string }>
}

function githubHeaders (token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

function getGithubToken (): string {
  const token = process.env.GITHUB_ISSUES_TOKEN ?? process.env.GITHUB_TOKEN
  if (!token) {
    const err = new Error('GitHub integration is not configured on this server.')
    ;(err as Error & { statusCode?: number }).statusCode = 503
    throw err
  }
  return token
}

async function githubGraphql <T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`GitHub GraphQL returned ${res.status}`)
  }
  if (
    json &&
    typeof json === 'object' &&
    'errors' in json &&
    Array.isArray((json as { errors?: { message?: string }[] }).errors) &&
    (json as { errors: { message?: string }[] }).errors.length
  ) {
    const messages = (json as { errors: { message?: string }[] }).errors
      .map((e) => e.message)
      .filter(Boolean)
      .join('; ')
    throw new Error(messages || 'GitHub GraphQL query failed')
  }
  return ((json as { data?: T })?.data ?? {}) as T
}

function matchOptionId (field: SingleSelectField | undefined, value: string | undefined): string | null {
  if (!field || !value) return null
  const exact = field.options.find((option) => option.name === value)
  if (exact) return exact.id
  const lower = value.toLowerCase()
  return field.options.find((option) => option.name.toLowerCase() === lower)?.id ?? null
}

async function assignIssueProjectFields (input: {
  token: string
  issueNodeId: string
  typeOfTask?: string
  teamRequest?: string
}): Promise<void> {
  const project = resolveGithubProjectRef()
  const ownerKind = project.ownerType === 'org' ? 'organization' : 'user'
  const typeFieldName = process.env.GITHUB_PROJECT_TYPE_OF_TASK_FIELD ?? 'Type of Task'
  const teamFieldName = process.env.GITHUB_PROJECT_TEAM_REQUEST_FIELD ?? 'Team Request'

  const meta = await githubGraphql<{
    owner?: {
      projectV2?: {
        id?: string
        fields?: { nodes?: Array<{ id?: string; name?: string; options?: Array<{ id?: string; name?: string }> }> }
      }
    }
  }>(
    input.token,
    `
      query ProjectFields($login: String!, $number: Int!) {
        owner: ${ownerKind}(login: $login) {
          projectV2(number: $number) {
            id
            fields(first: 40) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
              }
            }
          }
        }
      }
    `,
    { login: project.ownerLogin, number: project.projectNumber }
  )

  const projectId = meta.owner?.projectV2?.id
  if (!projectId) throw new Error('GitHub project not found')

  const fields: SingleSelectField[] = (meta.owner?.projectV2?.fields?.nodes ?? [])
    .filter((node): node is { id: string; name: string; options: Array<{ id: string; name: string }> } =>
      !!node.id && !!node.name && Array.isArray(node.options)
    )
    .map((node) => ({
      id: node.id,
      name: node.name,
      options: node.options.filter((option): option is { id: string; name: string } => !!option.id && !!option.name),
    }))

  const added = await githubGraphql<{
    addProjectV2ItemById?: { item?: { id?: string } }
  }>(
    input.token,
    `
      mutation AddIssueToProject($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }
    `,
    { projectId, contentId: input.issueNodeId }
  )

  const itemId = added.addProjectV2ItemById?.item?.id
  if (!itemId) throw new Error('Could not add issue to GitHub project')

  const updates: Array<{ fieldId: string; optionId: string }> = []
  const typeOptionId = matchOptionId(
    fields.find((field) => field.name === typeFieldName),
    input.typeOfTask
  )
  const teamOptionId = matchOptionId(
    fields.find((field) => field.name === teamFieldName),
    input.teamRequest
  )
  if (typeOptionId) {
    updates.push({
      fieldId: fields.find((field) => field.name === typeFieldName)!.id,
      optionId: typeOptionId,
    })
  }
  if (teamOptionId) {
    updates.push({
      fieldId: fields.find((field) => field.name === teamFieldName)!.id,
      optionId: teamOptionId,
    })
  }

  for (const update of updates) {
    await githubGraphql(
      input.token,
      `
        mutation SetProjectField($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
          updateProjectV2ItemFieldValue(input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: { singleSelectOptionId: $optionId }
          }) {
            projectV2Item { id }
          }
        }
      `,
      {
        projectId,
        itemId,
        fieldId: update.fieldId,
        optionId: update.optionId,
      }
    )
  }
}

async function ensureGithubLabel (
  token: string,
  repo: string,
  label: string,
  color: string,
  description: string
): Promise<void> {
  const existing = await fetch(
    `https://api.github.com/repos/${repo}/labels/${encodeURIComponent(label)}`,
    { headers: githubHeaders(token) }
  )
  if (existing.ok) return

  const created = await fetch(`https://api.github.com/repos/${repo}/labels`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({ name: label, color, description }),
  })
  if (created.ok || created.status === 422) return

  const msg = await created.text().catch(() => '')
  throw new Error(`Could not create GitHub label "${label}": ${created.status} ${msg}`)
}

export async function createGithubIssue (
  input: CreateGithubIssueInput
): Promise<CreateGithubIssueResult> {
  const token = getGithubToken()
  const repo = process.env.GITHUB_ISSUES_REPO ?? DEFAULT_GITHUB_ISSUES_REPO
  await ensureGithubLabel(
    token,
    repo,
    input.label,
    input.labelColor ?? '1D76DB',
    input.labelDescription ?? 'State / locality mapping review'
  )

  const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({
      title: input.title,
      body: input.body,
      labels: [input.label],
    }),
  })

  const ghJson: unknown = await ghRes.json().catch(() => null)
  if (!ghRes.ok) {
    const msg =
      ghJson &&
      typeof ghJson === 'object' &&
      'message' in ghJson &&
      typeof (ghJson as { message?: string }).message === 'string'
        ? (ghJson as { message: string }).message
        : `GitHub returned ${ghRes.status}`
    const err = new Error(msg)
    ;(err as Error & { statusCode?: number }).statusCode = 502
    throw err
  }

  const html_url =
    ghJson &&
    typeof ghJson === 'object' &&
    'html_url' in ghJson &&
    typeof (ghJson as { html_url?: string }).html_url === 'string'
      ? (ghJson as { html_url: string }).html_url
      : undefined
  const number =
    ghJson &&
    typeof ghJson === 'object' &&
    'number' in ghJson &&
    typeof (ghJson as { number?: number }).number === 'number'
      ? (ghJson as { number: number }).number
      : undefined
  const node_id =
    ghJson &&
    typeof ghJson === 'object' &&
    'node_id' in ghJson &&
    typeof (ghJson as { node_id?: string }).node_id === 'string'
      ? (ghJson as { node_id: string }).node_id
      : undefined

  if (node_id && (input.typeOfTask || input.teamRequest)) {
    try {
      await assignIssueProjectFields({
        token,
        issueNodeId: node_id,
        typeOfTask: input.typeOfTask,
        teamRequest: input.teamRequest,
      })
    } catch (error) {
      console.error('Could not set GitHub project fields on review ticket:', error)
    }
  }

  return { html_url, number }
}

export const GITHUB_STATES_REVIEW_LABEL = 'state-locality-change'
