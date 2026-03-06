import path from 'path'
import chalk from 'chalk'
import prompts from 'prompts'
import { execa } from 'execa'
import fs from 'fs-extra'

import { loadContext } from '../../core/context.js'
import { config } from '../../core/config.js'
import { log } from '../../core/logger.js'
import { GW_DIR } from '../../core/constants.js'

// ─── Remote parsing ───────────────────────────────────────────────────────────

function parseRemote(remote: string): { owner: string; repo: string } | null {
  const sshMatch = remote.match(/^git@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! }
  const httpsMatch = remote.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (httpsMatch) return { owner: httpsMatch[1]!, repo: httpsMatch[2]! }
  return null
}

function substituteTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ─── Provider API ─────────────────────────────────────────────────────────────

async function createGitHubIssue(
  token: string, owner: string, repo: string, title: string, body: string
): Promise<{ url: string; number: number }> {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.message ?? `GitHub API error ${res.status}`)
  }
  const data = await res.json() as any
  return { url: data.html_url, number: data.number }
}

async function createGitLabIssue(
  token: string, namespace: string, repo: string, title: string, description: string
): Promise<{ url: string; number: number }> {
  const projectPath = encodeURIComponent(`${namespace}/${repo}`)
  const res = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}/issues`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    const msg = Array.isArray(err.message) ? err.message.join(', ') : (err.message ?? `GitLab API error ${res.status}`)
    throw new Error(msg)
  }
  const data = await res.json() as any
  return { url: data.web_url, number: data.iid }
}

async function createBitbucketIssue(
  token: string, workspace: string, repo: string, title: string, content: string
): Promise<{ url: string; number: number }> {
  const authHeader = token.includes(':')
    ? `Basic ${Buffer.from(token).toString('base64')}`
    : `Bearer ${token}`
  const res = await fetch(`https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/issues`, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content: { raw: content } }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any
    throw new Error(err.error?.message ?? `Bitbucket API error ${res.status}`)
  }
  const data = await res.json() as any
  return { url: data.links?.html?.href ?? '', number: data.id }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type IssueCreateOptions = {
  title?: string
  body?: string
  open?: boolean  // false when --no-open is passed
}

export default async function issueCreate(options: IssueCreateOptions = {}) {
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

  log.title('🐛 Create Issue')

  // Resolve template: project-level first, then global ~/.gw fallback
  const projectTemplate = path.join(process.cwd(), '.git-templates', 'issue.md')
  const globalTemplate  = path.join(GW_DIR, 'issue-template.md')

  const templatePath = (await fs.pathExists(projectTemplate))
    ? projectTemplate
    : (await fs.pathExists(globalTemplate)) ? globalTemplate : null

  const templateVars = { repo, workspace: ctx.workspace.name }
  const defaultBody = templatePath
    ? substituteTemplate(await fs.readFile(templatePath, 'utf8'), templateVars)
    : ''

  if (templatePath === globalTemplate) {
    console.log(chalk.dim('  Using default issue template from ~/.gw/issue-template.md\n'))
  }

  // Prompts — skip fields provided via flags
  const promptFields: prompts.PromptObject[] = [
    ...(!options.title ? [{
      type: 'text' as const,
      name: 'title',
      message: 'Issue title:',
      validate: (v: string) => v.trim() ? true : 'Title is required',
    }] : []),
    ...(!options.body ? [{
      type: 'text' as const,
      name: 'body',
      message: 'Description (markdown):',
      initial: defaultBody,
    }] : []),
  ]

  const response = promptFields.length > 0
    ? await prompts(promptFields, { onCancel: () => { log.warn('Cancelled.'); process.exit(0) } })
    : {}

  const title = options.title ?? (response as any).title
  const body  = options.body  ?? (response as any).body ?? ''

  if (!title) return log.error('Issue title is required.')

  try {
    let result: { url: string; number: number }

    if (provider === 'github') {
      result = await createGitHubIssue(ws.token, owner, repo, title, body)
    } else if (provider === 'gitlab') {
      result = await createGitLabIssue(ws.token, owner, repo, title, body)
    } else {
      result = await createBitbucketIssue(ws.token, owner, repo, title, body)
    }

    console.log(chalk.green(`\n✅ Issue #${result.number} created!`))
    console.log(chalk.dim(`   ${result.url}\n`))

    // --no-open skips the prompt and doesn't open; otherwise ask
    if (options.open !== false) {
      const { openBrowser } = await prompts({
        type: 'confirm',
        name: 'openBrowser',
        message: 'Open in browser?',
        initial: true,
      })
      if (openBrowser) {
        await execa('open', [result.url]).catch(() => execa('xdg-open', [result.url]))
      }
    }
  } catch (err: any) {
    log.error(`Failed to create issue: ${err.message}`)
  }
}
