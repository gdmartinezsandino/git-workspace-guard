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
