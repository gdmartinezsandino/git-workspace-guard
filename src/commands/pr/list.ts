import chalk from 'chalk'

import { loadContext } from '../../core/context.js'
import { config } from '../../core/config.js'
import { log } from '../../core/logger.js'
import { listGitHubPRs, listGitLabMRs, listBitbucketPRs } from './api.js'

function parseRemote(remote: string): { owner: string; repo: string } | null {
  const sshMatch = remote.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! }
  const httpsMatch = remote.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! }
  return null
}

export default async function prList() {
  const ctx = await loadContext()
  if (!ctx.isGitRepo) return log.error('Not inside a git repository.')
  if (!ctx.workspace) return log.error('No active workspace. Run: gw workspace use <name>')
  if (!ctx.gitRemote) return log.error('No git remote origin found.')

  const parts = parseRemote(ctx.gitRemote)
  if (!parts) return log.error(`Cannot parse remote URL: ${ctx.gitRemote}`)

  const { owner, repo } = parts
  const provider = (ctx.gitHost === 'unknown' ? ctx.workspace.provider : ctx.gitHost) ?? 'github'
  const workspaces = config.get('workspaces')
  const ws = workspaces[ctx.workspace.name]

  if (!ws?.token) {
    return log.error(`No API token for workspace "${ctx.workspace.name}". Run: gw workspace edit <name>`)
  }

  log.title(`📋 Open Pull Requests — ${repo}`)

  try {
    let prs
    if (provider === 'github') {
      prs = await listGitHubPRs(ws.token, owner, repo)
    } else if (provider === 'gitlab') {
      prs = await listGitLabMRs(ws.token, owner, repo)
    } else {
      prs = await listBitbucketPRs(ws.token, owner, repo)
    }

    if (prs.length === 0) {
      log.info('No open pull requests found.')
      return
    }

    const maxTitleLen = Math.min(Math.max(...prs.map(p => p.title.length)), 58)

    console.log(
      chalk.dim(
        `  ${'#'.padEnd(6)} ${'Title'.padEnd(maxTitleLen + 2)} ${'Branch'.padEnd(28)} ${'Author'.padEnd(18)} Date`
      )
    )
    console.log(chalk.dim('  ' + '─'.repeat(maxTitleLen + 62)))

    for (const pr of prs) {
      const num    = chalk.cyan(`#${pr.number}`.padEnd(6))
      const draft  = pr.draft ? chalk.gray(' [draft]') : ''
      const title  = `${pr.title.slice(0, maxTitleLen).padEnd(maxTitleLen)}${draft}  `
      const branch = chalk.dim(pr.branch.slice(0, 26).padEnd(28))
      const author = chalk.yellow(`@${pr.author}`.slice(0, 17).padEnd(18))
      const date   = chalk.dim(pr.createdAt)
      console.log(`  ${num} ${title}${branch} ${author} ${date}`)
    }

    console.log(chalk.dim(`\n  ${prs.length} open PR${prs.length !== 1 ? 's' : ''}\n`))
  } catch (err: any) {
    log.error(`Failed to fetch PRs: ${err.message}`)
  }
}
