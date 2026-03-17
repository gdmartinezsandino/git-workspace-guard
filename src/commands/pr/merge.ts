import chalk from 'chalk'
import prompts from 'prompts'

import { loadContext } from '../../core/context.js'
import { config } from '../../core/config.js'
import { log } from '../../core/logger.js'
import {
  listGitHubPRs, listGitLabMRs, listBitbucketPRs,
  mergeGitHubPR, mergeGitLabMR, mergeBitbucketPR,
  type MergeMethod,
} from './api.js'

function parseRemote(remote: string): { owner: string; repo: string } | null {
  const sshMatch = remote.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! }
  const httpsMatch = remote.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! }
  return null
}

export default async function prMerge(prNumberArg?: string) {
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

  log.title(`🔀 Merge Pull Request — ${repo}`)

  // ── Resolve PR number ─────────────────────────────────────────────────────
  let prNumber: number

  if (prNumberArg) {
    prNumber = parseInt(prNumberArg, 10)
    if (isNaN(prNumber)) return log.error('Invalid PR number.')
  } else {
    console.log(chalk.dim('  Fetching open PRs...\n'))
    let prs
    try {
      if (provider === 'github')    prs = await listGitHubPRs(ws.token, owner, repo)
      else if (provider === 'gitlab') prs = await listGitLabMRs(ws.token, owner, repo)
      else                            prs = await listBitbucketPRs(ws.token, owner, repo)
    } catch (err: any) {
      return log.error(`Failed to fetch PRs: ${err.message}`)
    }

    if (prs.length === 0) {
      log.info('No open pull requests found.')
      return
    }

    const { chosen } = await prompts({
      type: 'select',
      name: 'chosen',
      message: 'Select a PR to merge:',
      choices: prs.map(pr => ({
        title: `#${pr.number}  ${pr.title.slice(0, 56)}  ${chalk.dim(`← ${pr.branch}`)}`,
        value: pr.number,
      })),
      initial: 0,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

    prNumber = chosen
  }

  // ── Merge method ──────────────────────────────────────────────────────────
  let mergeMethod: MergeMethod = 'merge'

  if (provider !== 'bitbucket') {
    const { method } = await prompts({
      type: 'select',
      name: 'method',
      message: 'Merge method:',
      choices: [
        { title: 'merge   — create a merge commit',       value: 'merge' },
        { title: 'squash  — squash all commits into one', value: 'squash' },
        { title: 'rebase  — rebase onto base branch',     value: 'rebase' },
      ],
      initial: 0,
    }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })
    mergeMethod = method
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  const { confirmed } = await prompts({
    type: 'confirm',
    name: 'confirmed',
    message: `Merge PR #${prNumber}${provider !== 'bitbucket' ? ` via "${mergeMethod}"` : ''}?`,
    initial: false,
  }, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

  if (!confirmed) return log.warn('Merge cancelled.')

  // ── Execute ───────────────────────────────────────────────────────────────
  try {
    if (provider === 'github') {
      await mergeGitHubPR(ws.token, owner, repo, prNumber, mergeMethod)
    } else if (provider === 'gitlab') {
      await mergeGitLabMR(ws.token, owner, repo, prNumber, mergeMethod)
    } else {
      await mergeBitbucketPR(ws.token, owner, repo, prNumber)
    }
    console.log(chalk.green(`\n✅ PR #${prNumber} merged successfully!\n`))
  } catch (err: any) {
    log.error(`Failed to merge PR #${prNumber}: ${err.message}`)
  }
}
