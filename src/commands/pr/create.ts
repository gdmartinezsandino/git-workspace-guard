import path from 'path'
import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'
import fs from 'fs-extra'

import { loadContext } from '../../core/context.js'
import { config } from '../../core/config.js'
import { log } from '../../core/logger.js'
import { GW_DIR } from '../../core/constants.js'
import { createGitHubPR, createBitbucketPR, createGitLabMR } from './api.js'

// ─── URL parsing ─────────────────────────────────────────────────────────────

type RepoParts = { owner: string; repo: string }

function parseRemote(remote: string): RepoParts | null {
  // git@github.com:owner/repo.git  OR  git@gw-personal:owner/repo.git
  const sshMatch = remote.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! }

  // https://github.com/owner/repo.git
  const httpsMatch = remote.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! }

  return null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function branchToTitle(branch: string): string {
  return branch
    .replace(/^(feat|fix|chore|docs|refactor|test|style)\//i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function substituteTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

async function getDefaultBranch(): Promise<string> {
  try {
    const { stdout } = await execa('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'])
    return stdout.trim().replace('origin/', '')
  } catch {
    return 'main'
  }
}

const TOKEN_HINTS: Record<string, string> = {
  github:    'GitHub Personal Access Token with repo scope        (e.g. ghp_xxxxxxxxxxxx)',
  gitlab:    'GitLab Personal Access Token with api scope         (e.g. glpat-xxxxxxxxxxxx)',
  bitbucket: 'Bitbucket App Password — bitbucket.org → Personal settings → App passwords\n   Enter as username:app_password  (needs Pull requests: Write scope)',
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default async function create() {
  log.title(chalk.cyan('\n🚀 Create Pull Request\n'))

  // 1. Context
  const ctx = await loadContext()

  if (!ctx.isGitRepo) return log.error('Not inside a git repository.')
  if (!ctx.workspace) return log.error('No active workspace. Run: gw workspace use <name>')
  if (!ctx.gitRemote) return log.error('No git remote origin found.')

  const parts = parseRemote(ctx.gitRemote)
  if (!parts) return log.error(`Cannot parse remote URL: ${ctx.gitRemote}`)

  const { owner, repo } = parts
  const provider = (ctx.gitHost === 'unknown' ? ctx.workspace.provider : ctx.gitHost) ?? 'github'

  // 2. Current + default branch
  const { stdout: headBranch } = await execa('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const currentBranch = headBranch.trim()
  const defaultBranch = await getDefaultBranch()

  // 3. Token check — prompt if missing, offer to save
  const workspaces = config.get('workspaces')
  const activeName = ctx.workspace.name
  let ws = workspaces[activeName]

  if (!ws.token) {
    log.warn(`No API token found for workspace "${activeName}".`)
    console.log(chalk.dim(`   ${TOKEN_HINTS[provider] ?? 'API token'}\n`))

    const tokenResponse = await prompts([
      {
        type: 'text',
        name: 'token',
        message: 'Token:',
        validate: (v: string) => v ? true : 'Token is required',
      },
      {
        type: 'confirm',
        name: 'save',
        message: 'Save token to workspace config for next time?',
        initial: true,
      },
    ], { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })

    if (tokenResponse.save) {
      workspaces[activeName] = { ...ws, token: tokenResponse.token }
      config.set('workspaces', workspaces)
    }

    ws = { ...ws, token: tokenResponse.token }
  }

  // 4. Read template — project-level first, then ~/.gw fallback
  const projectTemplate = path.join(process.cwd(), '.git-templates', 'pr.md')
  const globalTemplate  = path.join(GW_DIR, 'pr-template.md')

  const templatePath = (await fs.pathExists(projectTemplate))
    ? projectTemplate
    : (await fs.pathExists(globalTemplate)) ? globalTemplate : null

  const templateVars = { branch: currentBranch, base: defaultBranch, repo, workspace: activeName }
  const body = templatePath
    ? substituteTemplate(await fs.readFile(templatePath, 'utf8'), templateVars)
    : ''

  if (templatePath === globalTemplate) {
    console.log(chalk.dim('  Using default PR template from ~/.gw/pr-template.md\n'))
  }

  // 5. Interactive prompts
  const isDraftSupported = provider !== 'bitbucket'

  const prResponse = await prompts([
    {
      type: 'text',
      name: 'title',
      message: 'PR title:',
      initial: branchToTitle(currentBranch),
      validate: (v: string) => v ? true : 'Title is required',
    },
    {
      type: 'text',
      name: 'base',
      message: 'Base branch (target):',
      initial: defaultBranch,
      validate: (v: string) => v ? true : 'Base branch is required',
    },
    ...(isDraftSupported ? [{
      type: 'confirm' as const,
      name: 'draft',
      message: 'Open as draft?',
      initial: false,
    }] : []),
  ], { onCancel: () => { log.warn('PR creation cancelled.'); process.exit(0) } })

  // 6. Call provider API
  let result: { url: string; number: number }

  try {
    if (provider === 'github') {
      result = await createGitHubPR(ws.token!, owner, repo, {
        title: prResponse.title,
        body,
        head: currentBranch,
        base: prResponse.base,
        draft: prResponse.draft ?? false,
      })
    } else if (provider === 'bitbucket') {
      result = await createBitbucketPR(ws.token!, owner, repo, {
        title: prResponse.title,
        body,
        head: currentBranch,
        base: prResponse.base,
      })
    } else {
      result = await createGitLabMR(ws.token!, owner, repo, {
        title: prResponse.title,
        body,
        head: currentBranch,
        base: prResponse.base,
        draft: prResponse.draft ?? false,
      })
    }
  } catch (err: any) {
    return log.error(`Failed to create PR: ${err.message}`)
  }

  // 7. Success
  console.log(chalk.green(`\n✅ PR #${result!.number} created successfully!`))
  console.log(chalk.dim(`   ${result!.url}\n`))

  const { openBrowser } = await prompts({
    type: 'confirm',
    name: 'openBrowser',
    message: 'Open in browser?',
    initial: true,
  })

  if (openBrowser) {
    await execa('open', [result!.url]).catch(() => execa('xdg-open', [result!.url]))
  }
}
