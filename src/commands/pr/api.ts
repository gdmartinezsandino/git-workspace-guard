// ─── PR List ─────────────────────────────────────────────────────────────────

export type PRListItem = {
  number: number
  title: string
  author: string
  branch: string
  url: string
  createdAt: string
  draft?: boolean
}

export async function listGitHubPRs(token: string, owner: string, repo: string): Promise<PRListItem[]> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=30`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.message ?? `GitHub API error ${res.status}`)
  }
  const data = await res.json() as any[]
  return data.map(pr => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? 'unknown',
    branch: pr.head?.ref ?? '',
    url: pr.html_url,
    createdAt: pr.created_at?.slice(0, 10) ?? '',
    draft: pr.draft ?? false,
  }))
}

export async function listGitLabMRs(token: string, namespace: string, repo: string): Promise<PRListItem[]> {
  const projectPath = encodeURIComponent(`${namespace}/${repo}`)
  const res = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}/merge_requests?state=opened&per_page=30`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? `GitLab API error ${res.status}`))
  }
  const data = await res.json() as any[]
  return data.map(mr => ({
    number: mr.iid,
    title: mr.title,
    author: mr.author?.username ?? 'unknown',
    branch: mr.source_branch ?? '',
    url: mr.web_url,
    createdAt: mr.created_at?.slice(0, 10) ?? '',
    draft: mr.draft ?? false,
  }))
}

export async function listBitbucketPRs(token: string, workspace: string, repo: string): Promise<PRListItem[]> {
  const authHeader = token.includes(':')
    ? `Basic ${Buffer.from(token).toString('base64')}`
    : `Bearer ${token}`
  const res = await fetch(`https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests?state=OPEN&pagelen=30`, {
    headers: { 'Authorization': authHeader },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.error?.message ?? `Bitbucket API error ${res.status}`)
  }
  const data = await res.json() as any
  return (data.values ?? []).map((pr: any) => ({
    number: pr.id,
    title: pr.title,
    author: pr.author?.display_name ?? 'unknown',
    branch: pr.source?.branch?.name ?? '',
    url: pr.links?.html?.href ?? '',
    createdAt: pr.created_on?.slice(0, 10) ?? '',
  }))
}

// ─── PR Merge ─────────────────────────────────────────────────────────────────

export type MergeMethod = 'merge' | 'squash' | 'rebase'

export async function mergeGitHubPR(
  token: string, owner: string, repo: string, prNumber: number, method: MergeMethod
): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ merge_method: method }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.message ?? `GitHub API error ${res.status}`)
  }
}

export async function mergeGitLabMR(
  token: string, namespace: string, repo: string, mrIid: number, method: MergeMethod
): Promise<void> {
  const projectPath = encodeURIComponent(`${namespace}/${repo}`)
  const body: Record<string, any> = {}
  if (method === 'squash') body.squash = true
  const res = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}/merge_requests/${mrIid}/merge`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? `GitLab API error ${res.status}`)
    throw new Error(msg)
  }
}

export async function mergeBitbucketPR(
  token: string, workspace: string, repo: string, prId: number
): Promise<void> {
  const authHeader = token.includes(':')
    ? `Basic ${Buffer.from(token).toString('base64')}`
    : `Bearer ${token}`
  const res = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests/${prId}/merge`,
    {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.error?.message ?? `Bitbucket API error ${res.status}`)
  }
}

// ─── PR Create ────────────────────────────────────────────────────────────────

export type PRPayload = {
  title: string
  body: string
  head: string   // source branch
  base: string   // target branch
  draft: boolean
}

export type PRResult = {
  url: string
  number: number
}

// ─── GitHub ───────────────────────────────────────────────────────────────────

export async function createGitHubPR(
  token: string,
  owner: string,
  repo: string,
  payload: PRPayload
): Promise<PRResult> {
  const debug = !!process.env.GW_DEBUG
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    head: payload.head,
    base: payload.base,
    draft: payload.draft,
  })

  if (debug) {
    console.log('\n[GW_DEBUG] GitHub PR request:')
    console.log(`  URL:   ${url}`)
    console.log(`  owner: ${owner}`)
    console.log(`  repo:  ${repo}`)
    console.log(`  token: ${token.slice(0, 12)}...${token.slice(-4)}`)
    console.log(`  body:  ${body}`)
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body,
  })

  const rawText = await res.text()

  if (debug) {
    console.log(`\n[GW_DEBUG] GitHub PR response:`)
    console.log(`  status: ${res.status} ${res.statusText}`)
    console.log(`  body:   ${rawText}`)
  }

  if (!res.ok) {
    const err = JSON.parse(rawText || '{}') as any
    const detail = Array.isArray(err.errors)
      ? '\n  ' + err.errors.map((e: any) => e.message ?? JSON.stringify(e)).join('\n  ')
      : ''
    throw new Error((err.message ?? `GitHub API error ${res.status}`) + detail)
  }

  const data = JSON.parse(rawText) as any
  return { url: data.html_url, number: data.number }
}

// ─── Bitbucket ────────────────────────────────────────────────────────────────

export async function createBitbucketPR(
  // Bitbucket App Password — stored as "username:app_password" for Basic auth.
  // Bearer auth (API tokens) is NOT supported by the v2 REST pullrequests endpoint.
  token: string,
  workspace: string,
  repo: string,
  payload: Omit<PRPayload, 'draft'>
): Promise<PRResult> {
  const debug = !!process.env.GW_DEBUG
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests`
  const body = JSON.stringify({
    title: payload.title,
    description: payload.body,
    source: { branch: { name: payload.head } },
    destination: { branch: { name: payload.base } },
    reviewers: [],
  })

  if (debug) {
    console.log('\n[GW_DEBUG] Bitbucket PR request:')
    console.log(`  URL:       ${url}`)
    console.log(`  workspace: ${workspace}`)
    console.log(`  repo:      ${repo}`)
    console.log(`  token:     ${token.slice(0, 8)}...${token.slice(-4)}`)
    console.log(`  body:      ${body}`)
  }

  // Bitbucket REST API v2 requires Basic auth (username:app_password).
  // Bearer auth works only for OAuth 2.0 access tokens, not personal API tokens.
  const authHeader = token.includes(':')
    ? `Basic ${Buffer.from(token).toString('base64')}`
    : `Bearer ${token}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
    body,
  })

  const rawText = await res.text()

  if (debug) {
    console.log(`\n[GW_DEBUG] Bitbucket PR response:`)
    console.log(`  status: ${res.status} ${res.statusText}`)
    console.log(`  body:   ${rawText}`)
  }

  if (!res.ok) {
    const err = JSON.parse(rawText || '{}') as any
    const msg = err.error?.message ?? `Bitbucket API error ${res.status}`
    throw new Error(msg)
  }

  const data = JSON.parse(rawText) as any
  return { url: data.links.html.href, number: data.id }
}

// ─── GitLab ───────────────────────────────────────────────────────────────────

export async function createGitLabMR(
  token: string,
  namespace: string,
  repo: string,
  payload: PRPayload
): Promise<PRResult> {
  // GitLab requires the project path URL-encoded
  const projectPath = encodeURIComponent(`${namespace}/${repo}`)
  // Draft MRs use a title prefix instead of a dedicated field
  const title = payload.draft ? `Draft: ${payload.title}` : payload.title

  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${projectPath}/merge_requests`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        description: payload.body,
        source_branch: payload.head,
        target_branch: payload.base,
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? `GitLab API error ${res.status}`)
    throw new Error(msg)
  }

  const data = await res.json() as any
  return { url: data.web_url, number: data.iid }
}
