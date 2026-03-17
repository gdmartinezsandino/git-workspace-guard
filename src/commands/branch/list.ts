import chalk from 'chalk'
import { execa } from 'execa'

import { log } from '../../core/logger.js'
import { loadContext } from '../../core/context.js'
import { config } from '../../core/config.js'

// ─── Remote parsing ───────────────────────────────────────────────────────────

function parseRemote(remote: string): { owner: string; repo: string } | null {
  const sshMatch = remote.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! }
  const httpsMatch = remote.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! }
  return null
}

// ─── Provider API: fetch PR status for a branch ───────────────────────────────

async function getGitHubPRStatus(
  token: string, owner: string, repo: string, branch: string
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${encodeURIComponent(branch)}&state=all&per_page=1`
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) return 'unknown'
  const data = await res.json() as any[]
  if (!data.length) return 'no PR'
  const pr = data[0]
  if (pr.state === 'open') return pr.draft ? 'draft' : 'open'
  return pr.merged_at ? 'merged' : 'closed'
}

async function getGitLabMRStatus(
  token: string, namespace: string, repo: string, branch: string
): Promise<string> {
  const projectPath = encodeURIComponent(`${namespace}/${repo}`)
  const url = `https://gitlab.com/api/v4/projects/${projectPath}/merge_requests?source_branch=${encodeURIComponent(branch)}&state=all&per_page=1`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!res.ok) return 'unknown'
  const data = await res.json() as any[]
  if (!data.length) return 'no PR'
  const mr = data[0]
  if (mr.state === 'opened') return 'open'
  return mr.state === 'merged' ? 'merged' : mr.state
}

async function getBitbucketPRStatus(
  token: string, workspace: string, repo: string, branch: string
): Promise<string> {
  const authHeader = token.includes(':')
    ? `Basic ${Buffer.from(token).toString('base64')}`
    : `Bearer ${token}`
  // Fetch open PRs first, then merged, pick whichever returns results
  const url = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests?q=source.branch.name="${encodeURIComponent(branch)}"&state=OPEN&state=MERGED&pagelen=1`
  const res = await fetch(url, {
    headers: { 'Authorization': authHeader },
  })
  if (!res.ok) return 'unknown'
  const data = await res.json() as any
  const prs: any[] = data.values ?? []
  if (!prs.length) return 'no PR'
  return prs[0].state?.toLowerCase() ?? 'unknown'
}

// ─── Status badge renderer ────────────────────────────────────────────────────

function statusBadge(status: string): string {
  switch (status) {
    case 'open':    return chalk.green('● open')
    case 'draft':   return chalk.gray('◐ draft')
    case 'merged':  return chalk.magenta('✔ merged')
    case 'closed':  return chalk.red('✘ closed')
    case 'no PR':   return chalk.dim('— no PR')
    default:        return chalk.dim(`? ${status}`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function branchList() {
  const { stdout: root } = await execa('git', ['rev-parse', '--show-toplevel']).catch(() => ({ stdout: '' }))
  if (!root) return log.error('Not inside a git repository.')

  log.title('🌿 Branch List')

  // 1. Get all local branches with abbreviated hash and last commit subject
  const { stdout: branchesRaw } = await execa('git', ['branch', '-v', '--no-abbrev'])
  type BranchInfo = { name: string; current: boolean; hash: string; subject: string; prStatus?: string }

  const branches: BranchInfo[] = branchesRaw
    .trim()
    .split('\n')
    .map(line => {
      const current = line.startsWith('*')
      const rest = line.replace(/^\*?\s+/, '')
      // format: name  hash  subject
      const spaceIdx = rest.indexOf(' ')
      if (spaceIdx === -1) return null
      const name = rest.slice(0, spaceIdx)
      const after = rest.slice(spaceIdx + 1).trimStart()
      const spaceIdx2 = after.indexOf(' ')
      const hash = spaceIdx2 === -1 ? after : after.slice(0, spaceIdx2)
      const subject = spaceIdx2 === -1 ? '' : after.slice(spaceIdx2 + 1).trim()
      return { name, current, hash, subject }
    })
    .filter((b): b is BranchInfo => b !== null && !!b.name)

  // 2. Try to fetch PR status via provider API
  const ctx = await loadContext()
  const provider = ctx.gitHost !== 'unknown' ? ctx.gitHost : ctx.workspace?.provider
  const workspaces = config.get('workspaces')
  const token = ctx.workspace?.name ? workspaces[ctx.workspace.name]?.token : undefined
  const parts = ctx.gitRemote ? parseRemote(ctx.gitRemote) : null

  const hasApiAccess = !!token && !!parts && !!provider && provider !== 'unknown'

  if (hasApiAccess) {
    console.log(chalk.dim(`  Fetching PR status from ${provider}...\n`))
    for (const branch of branches) {
      try {
        if (provider === 'github') {
          branch.prStatus = await getGitHubPRStatus(token!, parts!.owner, parts!.repo, branch.name)
        } else if (provider === 'gitlab') {
          branch.prStatus = await getGitLabMRStatus(token!, parts!.owner, parts!.repo, branch.name)
        } else if (provider === 'bitbucket') {
          branch.prStatus = await getBitbucketPRStatus(token!, parts!.owner, parts!.repo, branch.name)
        }
      } catch {
        branch.prStatus = 'unknown'
      }
    }
  } else {
    console.log(chalk.dim('  No API token found — PR status unavailable.\n'))
    console.log(chalk.dim('  Tip: add a token with `gw workspace edit <name>`\n'))
  }

  // 3. Render table
  const maxLen = Math.max(...branches.map(b => b.name.length), 6)

  for (const branch of branches) {
    const prefix = branch.current ? chalk.cyan('*') : ' '
    const name = branch.current
      ? chalk.cyan(branch.name.padEnd(maxLen))
      : chalk.white(branch.name.padEnd(maxLen))
    const hash = chalk.dim(branch.hash.slice(0, 7))
    const subject = chalk.dim(branch.subject.slice(0, 48))
    const status = branch.prStatus ? `  ${statusBadge(branch.prStatus)}` : ''
    console.log(`  ${prefix} ${name}  ${hash}  ${subject}${status}`)
  }

  console.log()
}
